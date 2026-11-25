import { describe, expect, it } from 'vitest';

import type { InsightDay } from '@/lib/insights';

import { dayCellLabel, dayRing, startDate, weekCaption, weekDates } from './week';

const TODAY = '2026-11-13'; // a Friday

function d(date: string, kcal: number | null, budget = 2000): InsightDay {
  return {
    date,
    entries: kcal === null ? [] : [{ nutrients: { fiber: 0 } }],
    eaten: { kcal: kcal ?? 0, protein: 0, carbs: 0, fat: 0 },
    budget,
    macros: { proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    activities: [],
    activeMinutes: 0,
    waterEntries: [],
    waterMl: 0,
    waterGoalMl: 0,
  };
}

describe('dayRing', () => {
  it('leaves future and empty days as a plain track', () => {
    expect(dayRing(d('2026-11-14', 1500), TODAY)).toMatchObject({
      state: 'future',
      progress: 0,
    });
    expect(dayRing(d('2026-11-12', null), TODAY)).toMatchObject({
      state: 'empty',
      progress: 0,
    });
  });
  it('fills partially under budget', () => {
    expect(dayRing(d('2026-11-12', 1000), TODAY)).toMatchObject({
      state: 'under',
      progress: 0.5,
    });
  });
  it('marks on budget at 90 to 100% and never hides the over lip', () => {
    // 5% over: above the budget, drawn over with its lip, never on budget (one rule everywhere).
    expect(dayRing(d('2026-11-12', 2100), TODAY)).toMatchObject({ state: 'over', progress: 1.05, close: false });
    expect(dayRing(d('2026-11-12', 1850), TODAY)).toMatchObject({ state: 'band', progress: 0.925, close: true });
    expect(dayRing(d('2026-11-12', 2000), TODAY)).toMatchObject({ state: 'band', progress: 1, close: true });
    expect(dayRing(d('2026-11-12', 1500), TODAY)).toMatchObject({ state: 'under', close: false });
  });
  it('draws the lip in proportion above the band', () => {
    expect(dayRing(d('2026-11-12', 2500), TODAY)).toMatchObject({ state: 'over', progress: 1.25, close: false });
  });
  it('does not draw days before the profile was made as empty days', () => {
    expect(dayRing(d('2026-11-10', null), TODAY, '2026-11-12').state).toBe('before');
    expect(dayRing(d('2026-11-12', null), TODAY, '2026-11-12').state).toBe('empty');
    // Something logged (an import, another device) is shown whatever the start.
    expect(dayRing(d('2026-11-10', 1800), TODAY, '2026-11-12').state).toBe('band');
  });
  it('does not divide by a zero budget', () => {
    expect(dayRing(d('2026-11-12', 500, 0), TODAY).state).toBe('empty');
  });
});

describe('dayCellLabel', () => {
  const label = (date: string, kcal: number | null, budget = 2000, start?: string) => {
    const day = d(date, kcal, budget);
    return dayCellLabel(dayRing(day, TODAY, start), TODAY, day);
  };
  const future = (date: string) => dayCellLabel({ date, state: 'future', progress: 0, close: false }, TODAY);

  it('says the eaten figure grouped, with its unit and the word eaten, never as a year after the date', () => {
    // Monday Nov 9: a 4-digit figure straight after "Nov 9," must not read as a year.
    expect(label('2026-11-09', 2024, 2082)).toBe('M 9, Monday, Nov 9, 2,024 kilocalories eaten of 2,082');
    expect(label('2026-11-09', 2024, 2082)).not.toMatch(/Nov 9, 20\d\d\b/);
    expect(label('2026-11-11', 11480, 2160)).toBe('W 11, Wednesday, Nov 11, 11,480 kilocalories eaten of 2,160, above budget');
  });
  it('names today, yesterday and tomorrow from the day given, never the clock', () => {
    expect(label(TODAY, 1219.4, 2160)).toBe('F 13, Today, 1,219 kilocalories eaten of 2,160');
    expect(label('2026-11-12', 1850)).toBe('T 12, Yesterday, 1,850 kilocalories eaten of 2,000');
    expect(future('2026-11-14')).toBe('S 14, Tomorrow');
    expect(future('2026-11-15')).toBe('S 15, Sunday, Nov 15');
  });
  it('says each state of the cup: on budget, above, nothing logged, before the start', () => {
    expect(label('2026-11-10', 1900)).toBe('T 10, Tuesday, Nov 10, 1,900 kilocalories eaten of 2,000');
    expect(label('2026-11-10', 2100)).toBe('T 10, Tuesday, Nov 10, 2,100 kilocalories eaten of 2,000, above budget');
    expect(label('2026-11-10', null)).toBe('T 10, Tuesday, Nov 10, nothing logged');
    expect(label('2026-11-10', null, 2000, '2026-11-12')).toBe('T 10, Tuesday, Nov 10, before you started');
  });
  it('carries the year only for a day in another year', () => {
    const day = d('2025-12-29', 1500, 2000);
    expect(dayCellLabel(dayRing(day, '2026-01-02'), '2026-01-02', day)).toBe('M 29, Monday, Dec 29, 2025, 1,500 kilocalories eaten of 2,000');
  });
});

describe('startDate', () => {
  it('is the local day of onboardedAt', () => {
    expect(startDate(new Date(2026, 10, 14, 9, 30).toISOString())).toBe('2026-11-14');
    expect(startDate(undefined)).toBeUndefined();
    expect(startDate('nonsense')).toBeUndefined();
  });
});

describe('weekDates', () => {
  it('runs Monday to Sunday and pages back whole weeks', () => {
    expect(weekDates(TODAY)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(weekDates(TODAY, 1)[0]).toBe('2026-11-02');
    expect(weekDates('2026-11-09')[0]).toBe('2026-11-09');
  });
});

describe('weekCaption', () => {
  const week = (kcals: (number | null)[]) => weekDates(TODAY).map((date, i) => d(date, kcals[i] ?? null));

  it('averages complete days only, leaving out today and partial days', () => {
    // Mon 1700, Tue 1690, Wed 800 (partial), Thu nothing, Fri (today) 300.
    expect(weekCaption(week([1700, 1690, 800, null, 300]), TODAY)).toBe('Week so far: 310 kcal a day under budget, 2 full days');
  });
  it('reports over budget neutrally', () => {
    expect(weekCaption(week([2400, 2400]), TODAY)).toBe('Week so far: 400 kcal a day above budget, 2 full days');
  });
  it('says on budget only when every full day was on budget, by the one rule', () => {
    expect(weekCaption(week([1930, 1980, 2000]), TODAY)).toBe('Week so far: 3 full days on budget');
    // 2,030 and 2,010 are above their budget: the average is said instead.
    expect(weekCaption(week([2030, 1980, 2010]), TODAY)).toBe('Week so far: 10 kcal a day above budget, 3 full days');
    expect(weekCaption(week([2200, 1800]), TODAY)).toBe('Week so far: at budget on average, 2 full days');
  });
  it('says so when no complete day exists yet', () => {
    expect(weekCaption(week([null, null, null, null, 900]), TODAY)).toBe('Week so far: no full days logged yet');
    expect(
      weekCaption(
        weekDates('2026-11-09').map((x) => d(x, 400)),
        '2026-11-09',
      ),
    ).toBe('New week. Each logged day fills its cup.');
  });
  it('starts a new user at day 1, and leaves days before the start out', () => {
    expect(weekCaption(week([null, null, null, null, null]), TODAY, TODAY)).toBe('Day 1. Your week starts here.');
    // Started on Wednesday: Monday and Tuesday are not missed days.
    expect(weekCaption(week([null, null, 1900, 1950, 300]), TODAY, '2026-11-11')).toBe('Week so far: 2 full days on budget');
    expect(weekCaption(weekDates(TODAY, 2).map((x) => d(x, null)), TODAY, '2026-11-11')).toBe('Before you started');
  });
  it('labels a past week as that week', () => {
    const past = weekDates(TODAY, 1).map((x) => d(x, 1700));
    expect(weekCaption(past, TODAY)).toBe('That week: 300 kcal a day under budget, 7 full days');
    expect(weekCaption(weekDates(TODAY, 1).map((x) => d(x, 1800)), TODAY)).toBe('That week: 7 full days on budget');
  });
});
