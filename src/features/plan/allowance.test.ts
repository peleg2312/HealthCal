import { describe, expect, it } from 'vitest';

import { estimateLimitWords, type LimitInfo } from '@/features/ai/limit';

import { shareOfPlus, usedAllowance, usedUpNow } from './allowance';

const base: LimitInfo = { limit: 5, plan: 'free', cost: null, resetsAt: '2026-11-25T00:00:00Z', graceUntil: null, shared: false };

describe('the used-up cup at the estimate limit', () => {
  it('shows the whole allowance as used at the personal limit', () => {
    expect(usedAllowance(base, null)).toEqual({ used: 5, limit: 5 });
    expect(usedAllowance({ ...base, plan: 'plus', limit: 40 }, 0)).toEqual({ used: 40, limit: 40 });
  });
  it('is left out at the shared ceiling, for a careful estimate that needed more than is left, and with no plan fields', () => {
    expect(usedAllowance({ ...base, shared: true }, null)).toBe(null);
    expect(usedAllowance({ ...base, cost: 5 }, 3)).toBe(null);
    expect(usedAllowance(null, null)).toBe(null);
    expect(usedAllowance(undefined, 2)).toBe(null);
  });
  it('shows exactly when the limit words say "used"', () => {
    for (const shared of [false, true])
      for (const cost of [null, 1, 5])
        for (const left of [null, 0, 1, 3, 5, 9])
          for (const limit of [1, 5, 40]) {
            const info: LimitInfo = { ...base, shared, cost, limit };
            const says = /used$/.test(estimateLimitWords(info, left).title);
            expect(usedAllowance(info, left) !== null, JSON.stringify({ shared, cost, left, limit })).toBe(says);
          }
  });
});

describe('a Free cup in the comparison table', () => {
  it('is poured to its share of Plus', () => {
    expect(shareOfPlus(5, 40)).toBe(0.125);
    expect(shareOfPlus(5, 30)).toBeCloseTo(1 / 6);
    expect(shareOfPlus(3, 6)).toBe(0.5);
  });
  it('is full when Free gives as much, and empty for nothing', () => {
    expect(shareOfPlus(40, 40)).toBe(1);
    expect(shareOfPlus(40, 30)).toBe(1);
    expect(shareOfPlus(0, 40)).toBe(0);
    expect(shareOfPlus(5, 0)).toBe(1);
    expect(shareOfPlus(Number.NaN, 40)).toBe(0);
  });
});

describe("the coach's limit notice wears the used-up cup only for today's allowance", () => {
  // Local times, so the calendar day is the phone's own wherever the test runs.
  const at = new Date(2026, 10, 24, 15, 0).getTime();
  const info: LimitInfo = { ...base, resetsAt: null };
  it('on the day it was written, until the allowance resets', () => {
    expect(usedUpNow(info, at, new Date(2026, 10, 24, 15, 1))).toBe(true);
    expect(usedUpNow(info, at, new Date(2026, 10, 24, 23, 59))).toBe(true);
    const resetsAt = new Date(2026, 10, 24, 18, 0);
    expect(usedUpNow({ ...info, resetsAt: resetsAt.toISOString() }, at, new Date(2026, 10, 24, 17, 59))).toBe(true);
    expect(usedUpNow({ ...info, resetsAt: resetsAt.toISOString() }, at, new Date(2026, 10, 24, 18, 0))).toBe(false);
  });
  it('not from another day: yesterday\'s notice shows the info mark', () => {
    expect(usedUpNow(info, at, new Date(2026, 10, 25, 0, 1))).toBe(false);
    expect(usedUpNow(info, at, new Date(2026, 11, 2, 9, 0))).toBe(false);
  });
  it('never at the shared ceiling, never with plans off', () => {
    expect(usedUpNow({ ...info, shared: true }, at, new Date(2026, 10, 24, 15, 1))).toBe(false);
    expect(usedUpNow(null, at, new Date(2026, 10, 24, 15, 1))).toBe(false);
  });
});
