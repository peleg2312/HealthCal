import { describe, expect, it } from 'vitest';

import { isCompleteDay, summarizePeriod, type InsightDay } from '@/lib/insights';

import { daysVerdict } from './calorieBars';
import { monthGrid, type CalendarDayInput } from './consistency';
import { budgetDaysVerdict, countBudgetDays, recapDayCups, recapDaysVerdict } from './recapDays';

const day = (date: string, kcal: number, budget: number): InsightDay =>
  ({
    date,
    entries: kcal ? [{ nutrients: { fiber: 0 } }] : [],
    eaten: { kcal, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    budget,
    macros: { proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    activities: [],
    activeMinutes: 0,
    waterEntries: [],
    waterMl: 0,
    waterGoalMl: 2000,
  }) as unknown as InsightDay;

// The review's case (N2): Nov 7 is 2,230 of its own 2,384 and Nov 4 is 2,078 of 2,424.
const week = [
  day('2026-11-02', 2209, 2300),
  day('2026-11-03', 2050, 2100),
  day('2026-11-04', 2078, 2424),
  day('2026-11-05', 2180, 2190),
  day('2026-11-06', 1990, 2100),
  day('2026-11-07', 2230, 2384),
  day('2026-11-08', 2500, 2100),
];

describe('recap day cups', () => {
  const cups = recapDayCups('2026-11-02', week, '2026-11-14');

  it('measures each day against its own budget, never the average', () => {
    expect(cups[5]).toMatchObject({ over: false, check: true });
    expect(cups[2]).toMatchObject({ over: false, check: false });
    expect(cups[6]).toMatchObject({ over: true, check: false });
    expect(cups[2].ratio).toBeCloseTo(2078 / 2424, 5);
  });

  it('says the same thing as the cups', () => {
    expect(recapDaysVerdict(cups)).toEqual({ line: '5 of 7 days on budget, 1 above', note: 'On budget: a full day at 90 to 100% of its budget' });
  });

  it('gives each cup one signal: a day above its budget is amber with no check', () => {
    // 2,245 of 2,050 is above its budget: amber only, never a check.
    const [above, near, far] = recapDayCups('2026-11-02', [day('2026-11-02', 2245, 2050), day('2026-11-03', 2029, 2030), day('2026-11-04', 1500, 2050)], '2026-11-14');
    expect(above).toMatchObject({ over: true, check: false });
    expect(near).toMatchObject({ over: false, check: true });
    expect(far).toMatchObject({ over: false, check: false });
    for (const c of recapDayCups('2026-11-02', week, '2026-11-14')) expect(c.check && c.over).toBe(false);
    expect(recapDaysVerdict([above, near, far]).line).toBe('1 of 3 days on budget, 1 above');
  });

  it('marks days to come and today', () => {
    const open = recapDayCups('2026-11-09', [day('2026-11-09', 2000, 2100), day('2026-11-10', 900, 2100)], '2026-11-10');
    expect(open[1]).toMatchObject({ isToday: true, complete: false });
    expect(open[1].detail).toMatch(/still in progress/);
    expect(open[3].future).toBe(true);
    expect(recapDaysVerdict(open)).toEqual({ line: 'The one full day on budget', note: 'On budget: a full day at 90 to 100% of its budget' });
  });

  it('describes each cup in words that agree with it', () => {
    // The review's case: 2,245 of 2,050 is 109.5%, above its budget (amber lip).
    const [above, near, under, far] = recapDayCups(
      '2026-11-02',
      [day('2026-11-02', 2245, 2050), day('2026-11-03', 2029, 2030), day('2026-11-04', 1922, 2050), day('2026-11-05', 2600, 2100)],
      '2026-11-14',
    );
    expect(above.detail).toBe('Nov 2 · 2,245 of 2,050 kcal, 195 kcal above that day’s budget');
    expect(near.detail).toBe('Nov 3 · 2,029 of 2,030 kcal, 99% of that day’s budget, on budget');
    expect(under.detail).toBe('Nov 4 · 1,922 of 2,050 kcal, 93% of that day’s budget, on budget');
    expect(far.detail).toBe('Nov 5 · 2,600 of 2,100 kcal, 500 kcal above that day’s budget');
    for (const c of [above, near, under, far]) expect(c.detail).not.toMatch(/110%|100%/);
  });

  it('has nothing to judge without a full day', () => {
    expect(recapDaysVerdict(recapDayCups('2026-11-09', [], '2026-11-10'))).toEqual({ line: 'No fully logged days yet', note: null });
  });

  it('is one rule on the recap, Progress, the Nutrition card and the Consistency calendar', () => {
    // On budget is 90 to 100% of the day's own budget; above is over 100%; under 90% has no mark.
    const mixed = [...week, day('2026-11-09', 1890, 2100), day('2026-11-10', 2101, 2100), day('2026-11-11', 1880, 2100)];
    const today = '2026-11-14';
    const counts = countBudgetDays(mixed, today);
    expect(counts).toEqual({ full: 10, on: 6, above: 2 });
    // Progress's headline and its Nutrition card (`daysVerdict`), and the recap (its cups).
    expect(daysVerdict(mixed, today)).toEqual(budgetDaysVerdict(counts));
    expect(daysVerdict(mixed, today).line).toBe('6 of 10 days on budget, 2 above');
    const cups = [...recapDayCups('2026-11-02', mixed, today), ...recapDayCups('2026-11-09', mixed, today)];
    expect(cups.filter((c) => c.check)).toHaveLength(6);
    expect(cups.filter((c) => c.complete && c.over)).toHaveLength(2);
    // The Nutrition card's "On budget" figure (summarizePeriod).
    const c = summarizePeriod({ days: mixed, trend: [], sleep: [], today }).calories!;
    expect({ on: c.onBudget, above: c.above }).toEqual({ on: 6, above: 2 });
    // The Consistency calendar: the same six checks, and never a check on a day above its budget.
    const byDate = new Map<string, CalendarDayInput>(
      mixed.map((d) => [d.date, { date: d.date, logged: true, complete: isCompleteDay(d, today), kcal: d.eaten.kcal, budget: d.budget, waterMet: false, trained: false }]),
    );
    const cells = monthGrid('2026-11', byDate, today).flat().filter((x) => x !== null);
    expect(cells.filter((x) => x.onBudget).map((x) => x.date)).toEqual(cups.filter((x) => x.check).map((x) => x.date));
    for (const x of cells) if (x.ratio > 1) expect(x.onBudget).toBe(false);
  });
});
