import { describe, expect, it } from 'vitest';

import { BURN_UNIT, budgetAdds, budgetAddsShort, burnCaption, burnSource, NEXT_DAY_HINT } from './logWords';

describe("the run log's two numbers", () => {
  it('labels the burn as burned, with its source and range', () => {
    expect(BURN_UNIT).toBe('kcal burned');
    expect(burnSource(null)).toBe('Estimate');
    expect(burnSource('Garmin')).toBe('Measured by Garmin');
    expect(burnCaption([390, 585])).toBe('likely 390–585 kcal');
    expect(burnCaption([1040, 1560])).toBe('likely 1,040–1,560 kcal');
    expect(burnCaption(null)).toBe('total, resting included');
  });
  it('labels what reaches the budget by the rule of the day, never as the burn', () => {
    expect(budgetAdds('day', 423)).toEqual({ figure: '~423', words: 'added to your budget', spoken: 'about 423 kilocalories added to your budget' });
    expect(budgetAdds('week', 423)).toEqual({ figure: '~423', words: 'added to your budget over 7 days', spoken: 'about 423 kilocalories added to your budget over 7 days' });
    expect(budgetAdds('off', 423)).toEqual({ figure: '~423', words: 'not added to your budget', spoken: 'about 423 kilocalories not added to your budget' });
    expect(budgetAdds('day', 1234).figure).toBe('~1,234');
  });
  it('never uses the words of the other number', () => {
    for (const rule of ['day', 'week', 'off'] as const) expect(budgetAdds(rule, 100).words).not.toMatch(/burn/);
  });
  it("gives Train's history rows the same words, shorter", () => {
    expect(budgetAddsShort('day')).toBe('added');
    expect(budgetAddsShort('week')).toBe('added over 7 days');
    expect(budgetAddsShort('off')).toBe('not added');
    for (const rule of ['day', 'week', 'off'] as const) {
      expect(budgetAdds(rule, 290).words.replace(' to your budget', '')).toBe(budgetAddsShort(rule));
    }
  });
  it("says why the run log's date stops at today, in plain words", () => {
    expect(NEXT_DAY_HINT).toBe('Workouts are logged once done');
    expect(NEXT_DAY_HINT).not.toMatch(/!|can't|cannot|should/);
  });
});
