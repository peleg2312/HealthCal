import { describe, expect, it } from 'vitest';

import { BURN_UNIT, budgetAdds, budgetAddsShort, burnCaption, burnSource, NEXT_DAY_HINT, sourceWords } from './logWords';

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

describe('where the number comes from', () => {
  // A run that burned 2,205 kcal, 2,051 of them above resting (the figures the hero and the tile say).
  const base = { measuredBy: null, formula: { met: 9.3, weight: '142.6 kg', minutes: 95 }, restingDay: 2330, restingShare: 154, dayShare: 293, dayWord: "today's" };
  const all = (w: { how: string; resting: string; note: string }) => `${w.how} ${w.resting} ${w.note}`;
  it('never says the burn or what is added again: each figure is said once in the view', () => {
    for (const rule of ['day', 'week', 'off'] as const) {
      for (const measuredBy of [null, 'Garmin']) {
        const text = all(sourceWords({ ...base, measuredBy, rule }));
        expect(text).not.toMatch(/2,205|2,051|2205|2051/);
      }
    }
  });
  it('explains the estimate with its formula and its margin', () => {
    const w = sourceWords({ ...base, rule: 'day' });
    expect(w.how).toBe('9.3 MET (9.3 times your resting burn) × 3.5 ml O₂ per kg per minute × 142.6 kg × 95 min ÷ 200 gives the burn above.');
    expect(w.resting).toBe("Your day already assumes 2,330 kcal for resting and daily life, 154 kcal of it in these minutes. The part above that is added to today's budget.");
    expect(w.note).toBe('MET values describe an average adult, so the range allows about 20% either way.');
  });
  it('says where the part above resting goes by the rule of the day', () => {
    expect(sourceWords({ ...base, rule: 'week' }).resting).toMatch(/spread over 7 days: about 293 kcal a day is added to today's budget and each of the next six days\.$/);
    expect(sourceWords({ ...base, rule: 'off' }).resting).toMatch(/turned off in your goals, so your budget stays the same\.$/);
  });
  it('names the device for a measured burn', () => {
    const w = sourceWords({ ...base, measuredBy: 'Garmin', formula: null, rule: 'day' });
    expect(w.how).toBe('The burn above is the total Garmin measured for this session, resting included.');
    expect(w.note).toMatch(/replaces the measured figure with an estimate/);
  });
});
