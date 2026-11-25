import { describe, expect, it } from 'vitest';

import { QUICK_KCAL_LIMIT, quickKcalError } from './helpers';
import { QUICK_KCAL_ASK, QUICK_KCAL_CHECK, quickAddPress, quickAddTitle, quickAddWaiting, quickKcalAsks } from './quickCheck';

describe("quick add's soft check", () => {
  it('asks only above a plausible single entry and under the hard limit, which it leaves as it is', () => {
    expect(QUICK_KCAL_CHECK).toBe(3000);
    expect(quickKcalAsks(null)).toBe(false);
    expect(quickKcalAsks(350)).toBe(false);
    expect(quickKcalAsks(3000)).toBe(false);
    expect(quickKcalAsks(3001)).toBe(true);
    expect(quickKcalAsks(5000)).toBe(true);
    expect(quickKcalAsks(QUICK_KCAL_LIMIT - 1)).toBe(true);
    // The hard limit is still the field's error, not a question.
    expect(quickKcalAsks(QUICK_KCAL_LIMIT)).toBe(false);
    expect(quickKcalError(String(QUICK_KCAL_LIMIT))).toBe('Enter 1 to 9,999 kcal.');
    expect(quickKcalError('5000')).toBeNull();
  });

  it('adds a usual amount on the first press', () => {
    expect(quickAddPress(350, null)).toBe('add');
    expect(quickAddPress(3000, null)).toBe('add');
  });

  it('adds a large amount only on a second press of the same amount', () => {
    expect(quickAddPress(5000, null)).toBe('ask');
    expect(quickAddPress(5000, 5000)).toBe('add');
    // Changed after the question (a typo fixed, or another large amount): asked again, or added when usual.
    expect(quickAddPress(4000, 5000)).toBe('ask');
    expect(quickAddPress(500, 5000)).toBe('add');
  });

  it('waits only while the amount on screen is the one asked about', () => {
    expect(quickAddWaiting(5000, null)).toBe(false);
    expect(quickAddWaiting(5000, 5000)).toBe(true);
    expect(quickAddWaiting(4000, 5000)).toBe(false);
    expect(quickAddWaiting(null, 5000)).toBe(false);
  });

  it('names the amount on the button while it waits, and says why in one neutral sentence', () => {
    expect(quickAddTitle('lunch', null)).toBe('Add to lunch');
    expect(quickAddTitle('breakfast', 5000)).toBe('Add 5,000 kcal to breakfast');
    expect(QUICK_KCAL_ASK).toMatch(/^[A-Z][^.!]*\.$/);
    expect(QUICK_KCAL_ASK).not.toMatch(/\b(bad|failed|should|cheat|great|missed your|too much)\b/i);
  });
});
