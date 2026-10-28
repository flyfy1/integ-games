import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScoreSync } from '../src/core/score-sync';

describe('score sync', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('collapses many increasing reports into one submit', () => {
    const submit = vi.fn(async () => {});
    const sync = createScoreSync(submit, 4000);
    for (let i = 1; i <= 50; i += 1) sync.report('breakout', i * 10);
    expect(submit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('breakout', 500);
  });

  it('ignores lower and equal scores', () => {
    const submit = vi.fn(async () => {});
    const sync = createScoreSync(submit);
    sync.report('snake', 100);
    sync.flush();
    sync.report('snake', 50);
    sync.report('snake', 100);
    vi.advanceTimersByTime(10000);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('flush sends immediately and cancels the timer', () => {
    const submit = vi.fn(async () => {});
    const sync = createScoreSync(submit);
    sync.report('flap', 7);
    sync.flush();
    expect(submit).toHaveBeenCalledWith('flap', 7);
    vi.advanceTimersByTime(10000);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('sends a higher score after a flush and tracks games separately', () => {
    const submit = vi.fn(async () => {});
    const sync = createScoreSync(submit);
    sync.report('a', 5);
    sync.report('b', 3);
    sync.flush();
    sync.report('a', 9);
    sync.flush();
    expect(submit.mock.calls).toEqual([['a', 5], ['b', 3], ['a', 9]]);
  });
});
