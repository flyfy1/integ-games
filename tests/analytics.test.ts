import { describe, expect, it } from 'vitest';
import { analyticsPath, startAnalytics } from '../src/analytics';

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
});
