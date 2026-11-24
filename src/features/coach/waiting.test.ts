/** The waiting state's rules: the words, and the loop that must stop (spec r14, section 4). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startWaitLoop, waitDuration, waitWords, WAIT_HIGH, WAIT_LONG_AFTER_MS, WAIT_LOOP_MS, WAIT_LOW, WAIT_REST } from './waiting';
import { WAIT_LONG, WAIT_PLAIN, WAIT_SHARED } from './words';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('waitWords', () => {
  it('reads the week only while it is shared, and says when it takes longer', () => {
    expect(waitWords(true, 0)).toBe(WAIT_SHARED);
    expect(waitWords(false, 9_999)).toBe(WAIT_PLAIN);
    expect(waitWords(true, WAIT_LONG_AFTER_MS)).toBe(WAIT_LONG);
  });
});

describe('startWaitLoop', () => {
  it('pours up and falls back once a turn, 1,120 ms a turn', () => {
    const seen: number[] = [];
    const stop = startWaitLoop((l) => seen.push(l), false);
    expect(WAIT_LOOP_MS).toBe(1120);
    expect(seen).toEqual([WAIT_LOW, WAIT_HIGH]);
    vi.advanceTimersByTime(960);
    expect(seen.at(-1)).toBe(WAIT_LOW);
    vi.advanceTimersByTime(160);
    expect(seen.at(-1)).toBe(WAIT_HIGH);
    stop();
  });

  it('stops: no call after the stop (the screen stops it on unmount and on arrival)', () => {
    const set = vi.fn();
    const stop = startWaitLoop(set, false);
    stop();
    const calls = set.mock.calls.length;
    vi.advanceTimersByTime(10_000);
    expect(set.mock.calls.length).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('under reduced motion starts nothing and rests half full', () => {
    const set = vi.fn();
    startWaitLoop(set, true);
    expect(set.mock.calls).toEqual([[WAIT_REST]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pours up over the small pour and falls over the fade', () => {
    expect(waitDuration(WAIT_HIGH)).toBe(360);
    expect(waitDuration(WAIT_LOW)).toBe(160);
  });
});
