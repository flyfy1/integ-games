import { describe, expect, it } from 'vitest';
import { analyticsPath, startAnalytics, trackEvent } from '../src/analytics';

describe('production page analytics', () => {
  it('only reports public game paths', () => {
    expect(analyticsPath('/play/merge-2048')).toBe('/play/merge-2048/');
    expect(analyticsPath('/private-player-id')).toBe('/not-found');
    expect(analyticsPath('/play/unknown-game')).toBe('/not-found');
  });
  it('does not load the tag on a preview origin', () => {
    startAnalytics(window);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
  it('sends game events only after the tag started, with numbers and enums only, at most 40 a page', () => {
    const fake = { dataLayer: [] as unknown[] } as unknown as Window & { dataLayer: unknown[]; integAnalyticsStarted?: boolean };
    expect(trackEvent('ace', { hole: 3 }, fake)).toBe(false);
    fake.integAnalyticsStarted = true;
    expect(trackEvent('ace', { hole: 3, tries: 2, slug: 'pebble-putt', note: 'Free text!' }, fake)).toBe(true);
    const args = Array.from(fake.dataLayer[0] as ArrayLike<unknown>);
    expect(args[0]).toBe('event');
    expect(args[1]).toBe('ace');
    expect(args[2]).toMatchObject({ hole: 3, tries: 2, slug: 'pebble-putt' });
    expect(args[2]).not.toHaveProperty('note');
    for (let i = 0; i < 60; i++) trackEvent('ace', { hole: 1 }, fake);
    expect(fake.dataLayer).toHaveLength(40);
  });
});
