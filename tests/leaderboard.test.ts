import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaderboard } from '../src/core/online';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('leaderboard data and deadlines', () => {
  it('returns actual scores and a successful empty board', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ name: 'QA', score: 8, games: 1 }]))).mockResolvedValueOnce(new Response('[]')));
    expect(await leaderboard()).toEqual([{ name: 'QA', score: 8, games: 1 }]);
    expect(await leaderboard()).toEqual([]);
  });
  it('keeps service failure distinguishable from an empty board', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(leaderboard()).rejects.toThrow('API 503');
  });
  it('rejects malformed score data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[{"name":"QA","score":null,"games":1}]')));
    await expect(leaderboard()).rejects.toThrow('Invalid leaderboard response');
  });
  it('aborts a stalled request after five seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
    const rejected = expect(leaderboard()).rejects.toThrow('Aborted');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
  });
});
