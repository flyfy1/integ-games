import { seededRandom } from '../../core/services';
import type { GameStorage } from '../../core/game-types';

/**
 * Shared daily-challenge kit: one seed per calendar date (the player's local
 * date), a streak that pauses rather than resets on a missed day, and a
 * share line. Every visitor on the same date gets the same seed per game.
 */

/** Local calendar date as YYYY-MM-DD. */
export function dailyKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Stable 32-bit seed for a game on a date (FNV-1a over "slug:date"). */
export function dailySeed(slug: string, key: string = dailyKey()): number {
  let hash = 0x811c9dc5;
  for (const ch of `${slug}:${key}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic random stream for today's challenge of a game. */
export function dailyRandom(slug: string, key: string = dailyKey()): () => number {
  return seededRandom(dailySeed(slug, key));
}

/** Days between two YYYY-MM-DD keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export type DailyRecord = {
  /** Last date a daily was completed. */
  lastKey: string | null;
  /** Consecutive completed days; a missed day pauses (keeps) it, it never resets to 0. */
  streak: number;
  /** Longest streak ever. */
  bestStreak: number;
  /** Total dailies completed. */
  played: number;
  /** Best score per date key (only the most recent 30 kept). */
  scores: Record<string, number>;
};

const EMPTY: DailyRecord = { lastKey: null, streak: 0, bestStreak: 0, played: 0, scores: {} };

function storageKey(mode: string): string { return mode ? `daily-${mode}` : 'daily'; }

export function readDaily(storage: GameStorage, mode = ''): DailyRecord {
  const raw = storage.get<Partial<DailyRecord> | null>(storageKey(mode), null);
  if (!raw || typeof raw !== 'object') return { ...EMPTY, scores: {} };
  return {
    lastKey: typeof raw.lastKey === 'string' ? raw.lastKey : null,
    streak: Number.isFinite(raw.streak) ? Number(raw.streak) : 0,
    bestStreak: Number.isFinite(raw.bestStreak) ? Number(raw.bestStreak) : 0,
    played: Number.isFinite(raw.played) ? Number(raw.played) : 0,
    scores: raw.scores && typeof raw.scores === 'object' ? { ...raw.scores } : {}
  };
}

/**
 * Record a finished daily. Replaying the same day only keeps the best score.
 * The streak grows by one per new day played; skipped days pause it.
 */
export function recordDaily(storage: GameStorage, score: number, mode = '', key: string = dailyKey()): DailyRecord {
  const rec = readDaily(storage, mode);
  const firstToday = rec.lastKey !== key;
  if (firstToday && (rec.lastKey === null || daysBetween(rec.lastKey, key) > 0)) {
    rec.streak += 1;
    rec.played += 1;
    rec.lastKey = key;
  }
  rec.bestStreak = Math.max(rec.bestStreak, rec.streak);
  rec.scores[key] = Math.max(rec.scores[key] ?? -Infinity, score);
  const keys = Object.keys(rec.scores).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 30))) delete rec.scores[old];
  storage.set(storageKey(mode), rec);
  return rec;
}

/** Whether today's daily has been completed at least once. */
export function playedToday(storage: GameStorage, mode = '', key: string = dailyKey()): boolean {
  return readDaily(storage, mode).lastKey === key;
}

/** Plain share line, e.g. "Block Drop daily 2026-11-24 · 12,340 · streak 5". */
export function dailyShareText(title: string, score: string | number, streak: number, key: string = dailyKey(), zh = false): string {
  const shown = typeof score === 'number' ? score.toLocaleString(zh ? 'zh-CN' : 'en-US') : score;
  return zh
    ? `${title} 每日挑战 ${key} · ${shown} · 连续 ${streak} 天 · games.integ.life`
    : `${title} daily ${key} · ${shown} · streak ${streak} · games.integ.life`;
}
