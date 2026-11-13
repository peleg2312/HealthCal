import { describe, expect, it } from 'vitest';

import { recapLine } from './recapLine';

const d = (kcal: number | null, budget = 2000) => ({ entries: kcal === null ? [] : [{}], eaten: { kcal: kcal ?? 0 }, budget });

describe('recapLine', () => {
  it('counts logged days and the ones inside the budget band', () => {
    expect(recapLine([d(2000), d(1950), d(2400), d(null), d(1500), d(2100), d(null)])).toBe('Logged 5 of 7 days, 3 on budget');
  });
  it('leaves out the budget part when no day was on budget', () => {
    expect(recapLine([d(1200), d(null), d(2600), d(null), d(null), d(null), d(null)])).toBe('Logged 2 of 7 days');
  });
  it('ignores a day with no budget', () => {
    expect(recapLine([d(0, 0), d(2000)])).toBe('Logged 2 of 2 days, 1 on budget');
  });
});
