import type { StageBest } from './sim';

/** Cosmetic unlocks bought with stars (normal and storm stars both count). Purely visual. */
export type Slot = 'hat' | 'paint' | 'trail';
export type Cosmetic = { id: string; slot: Slot; stars: number; name: string; nameEn: string; col: string[] };

export const COSMETICS: Cosmetic[] = [
  { id: 'cap', slot: 'hat', stars: 0, name: '水手帽', nameEn: 'Sailor cap', col: ['#1d3557', '#e63946'] },
  { id: 'straw', slot: 'hat', stars: 12, name: '草帽', nameEn: 'Straw hat', col: ['#f2cc6b', '#c9952e'] },
  { id: 'beanie', slot: 'hat', stars: 30, name: '条纹毛线帽', nameEn: 'Striped beanie', col: ['#2ec4b6', '#ffffff'] },
  { id: 'crown', slot: 'hat', stars: 72, name: '金冠', nameEn: 'Golden crown', col: ['#ffd166', '#f48c06'] },
  { id: 'red', slot: 'paint', stars: 0, name: '经典红', nameEn: 'Classic red', col: ['#e63946'] },
  { id: 'sunset', slot: 'paint', stars: 6, name: '落日橙', nameEn: 'Sunset orange', col: ['#ff8c42'] },
  { id: 'storm', slot: 'paint', stars: 45, name: '风暴银', nameEn: 'Storm silver', col: ['#a9b8d6'] },
  { id: 'none', slot: 'trail', stars: 0, name: '无', nameEn: 'None', col: [] },
  { id: 'bubbles', slot: 'trail', stars: 20, name: '泡泡', nameEn: 'Bubbles', col: ['#bfe9ff', '#ffffff', '#7fd3ff'] },
  { id: 'rainbow', slot: 'trail', stars: 60, name: '彩虹', nameEn: 'Rainbow', col: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'] }
];
export const SLOTS: Slot[] = ['hat', 'paint', 'trail'];

export type Look = Record<Slot, string>;
export const DEFAULT_LOOK: Look = { hat: 'cap', paint: 'red', trail: 'none' };

/** Stars banked: the best star count of every stage, normal and storm. */
export function starTotal(...books: (readonly (StageBest | null | undefined)[])[]): number {
  let n = 0;
  for (const b of books) for (const s of b) n += s && typeof s.stars === 'number' ? Math.max(0, Math.min(3, s.stars)) : 0;
  return n;
}

export const item = (id: string) => COSMETICS.find((c) => c.id === id);
export const isUnlocked = (id: string, stars: number) => (item(id)?.stars ?? Infinity) <= stars;

/** A stored look, with anything unknown or not (yet) earned put back to the default. */
export function sanitizeLook(raw: unknown, stars: number): Look {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<Slot, unknown>>;
  const look = { ...DEFAULT_LOOK };
  for (const slot of SLOTS) {
    const id = o[slot];
    if (typeof id === 'string' && item(id)?.slot === slot && isUnlocked(id, stars)) look[slot] = id;
  }
  return look;
}

/** The next earned item in a slot, cycling in `dir` and skipping locked ones. */
export function cycle(look: Look, slot: Slot, dir: number, stars: number): Look {
  const list = COSMETICS.filter((c) => c.slot === slot && c.stars <= stars);
  const i = Math.max(0, list.findIndex((c) => c.id === look[slot]));
  return { ...look, [slot]: list[(i + dir + list.length) % list.length].id };
}

/** The cheapest item not yet earned, for a "next unlock" hint. */
export const nextUnlock = (stars: number) => COSMETICS.filter((c) => c.stars > stars).sort((a, b) => a.stars - b.stars)[0];
