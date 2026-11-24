import { describe, expect, it } from 'vitest';
import { dailyKey, dailySeed, dailyRandom, daysBetween, readDaily, recordDaily, playedToday, dailyShareText } from '../src/games/_shared/daily';
import type { GameStorage } from '../src/core/game-types';

function memory(): GameStorage {
  const map = new Map<string, unknown>();
  return { get: (k, f) => (map.has(k) ? (map.get(k) as never) : f), set: (k, v) => void map.set(k, structuredClone(v)), remove: (k) => void map.delete(k) };
}

describe('daily kit', () => {
  it('formats local dates and seeds deterministically per game and date', () => {
    expect(dailyKey(new Date(2026, 10, 4))).toBe('2026-11-04');
    expect(dailySeed('block-drop', '2026-11-24')).toBe(dailySeed('block-drop', '2026-11-24'));
    expect(dailySeed('block-drop', '2026-11-24')).not.toBe(dailySeed('block-drop', '2026-11-25'));
    expect(dailySeed('block-drop', '2026-11-24')).not.toBe(dailySeed('fruit-merge', '2026-11-24'));
    const a = dailyRandom('x', '2026-01-01'); const b = dailyRandom('x', '2026-01-01');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('counts days across month and year boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
  });

  it('grows the streak once per day and pauses it on a missed day', () => {
    const s = memory();
    expect(readDaily(s).streak).toBe(0);
    recordDaily(s, 10, '', '2026-11-20');
    recordDaily(s, 30, '', '2026-11-20');
    expect(readDaily(s)).toMatchObject({ streak: 1, played: 1, scores: { '2026-11-20': 30 } });
    recordDaily(s, 5, '', '2026-11-21');
    recordDaily(s, 5, '', '2026-11-24');
    expect(readDaily(s)).toMatchObject({ streak: 3, bestStreak: 3, played: 3 });
    expect(playedToday(s, '', '2026-11-24')).toBe(true);
    expect(playedToday(s, 'sprint', '2026-11-24')).toBe(false);
  });

  it('survives malformed storage and keeps only 30 scores', () => {
    const s = memory();
    s.set('daily', 'garbage');
    expect(readDaily(s).streak).toBe(0);
    for (let d = 1; d <= 35; d += 1) recordDaily(s, d, '', dailyKey(new Date(2026, 0, d)));
    expect(Object.keys(readDaily(s).scores).length).toBeLessThanOrEqual(30);
  });

  it('builds share lines in both languages', () => {
    expect(dailyShareText('Block Drop', 12340, 5, '2026-11-24')).toBe('Block Drop daily 2026-11-24 · 12,340 · streak 5 · games.integ.life');
    expect(dailyShareText('方块', 7, 2, '2026-11-24', true)).toContain('连续 2 天');
  });
});
