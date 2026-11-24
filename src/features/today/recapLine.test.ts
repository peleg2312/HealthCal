import { describe, expect, it } from 'vitest';

import { recapLine } from './recapLine';

const d = (kcal: number | null, budget = 2000) => ({ entries: kcal === null ? [] : [{}], eaten: { kcal: kcal ?? 0 }, budget });

describe('recapLine', () => {
  it('counts logged days and the full days on budget (90 to 100%), as the recap does', () => {
    // 2,000 and 1,950 are on budget; 2,100 and 2,400 are above it; 1,500 is under 90%.
    expect(recapLine([d(2000), d(1950), d(2400), d(null), d(1500), d(2100), d(null)])).toBe('Logged 5 of 7 days, 2 on budget');
    // A budget under 800 kcal: a 700 kcal day is not fully logged, so it is not on budget.
    expect(recapLine([d(700, 750), d(1800)])).toBe('Logged 2 of 2 days, 1 on budget');
  });
  it('leaves out the budget part when no day was on budget', () => {
    expect(recapLine([d(1200), d(null), d(2600), d(null), d(null), d(null), d(null)])).toBe('Logged 2 of 7 days');
  });
  it('ignores a day with no budget', () => {
    expect(recapLine([d(0, 0), d(2000)])).toBe('Logged 2 of 2 days, 1 on budget');
  });
});
