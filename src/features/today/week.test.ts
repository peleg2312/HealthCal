import { describe, expect, it } from 'vitest';

import type { InsightDay } from '@/lib/insights';

import { dayRing, startDate, weekCaption, weekDates } from './week';

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
  it('keeps the band as "close" but never hides the over lip', () => {
    // 5% over: still close to budget, and drawn over with its lip (one rule for over everywhere).
    expect(dayRing(d('2026-11-12', 2100), TODAY)).toMatchObject({ state: 'over', progress: 1.05, close: true });
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
    expect(weekCaption(week([2400, 2400]), TODAY)).toBe('Week so far: 400 kcal a day over budget, 2 full days');
  });
  it('calls a small average difference on budget', () => {
    expect(weekCaption(week([2030, 1980, 2010]), TODAY)).toBe('Week so far: on budget, 3 full days');
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
    expect(weekCaption(week([null, null, 1900, 1950, 300]), TODAY, '2026-11-11')).toBe('Week so far: on budget, 2 full days');
    expect(weekCaption(weekDates(TODAY, 2).map((x) => d(x, null)), TODAY, '2026-11-11')).toBe('Before you started');
  });
  it('labels a past week as that week', () => {
    const past = weekDates(TODAY, 1).map((x) => d(x, 1800));
    expect(weekCaption(past, TODAY)).toBe('That week: 200 kcal a day under budget, 7 full days');
  });
});
