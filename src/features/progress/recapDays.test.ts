import { describe, expect, it } from 'vitest';

import type { InsightDay } from '@/lib/insights';

import { recapDayCups, recapDaysVerdict } from './recapDays';

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
    expect(cups[5]).toMatchObject({ over: false, inBand: true });
    expect(cups[2]).toMatchObject({ over: false, inBand: false });
    expect(cups[6]).toMatchObject({ over: true, inBand: false });
    expect(cups[2].ratio).toBeCloseTo(2078 / 2424, 5);
  });

  it('says the same thing as the cups', () => {
    expect(recapDaysVerdict(cups)).toBe('5 of 7 full days within 10% of their budget; 1 more than 10% above');
  });

  it('marks days to come and today', () => {
    const open = recapDayCups('2026-11-09', [day('2026-11-09', 2000, 2100), day('2026-11-10', 900, 2100)], '2026-11-10');
    expect(open[1]).toMatchObject({ isToday: true, complete: false });
    expect(open[1].detail).toMatch(/still in progress/);
    expect(open[3].future).toBe(true);
    expect(recapDaysVerdict(open)).toBe('The one full day was within 10% of its budget');
  });

  it('describes each cup in words that agree with it', () => {
    // The review's case: 2,245 of 2,050 is 109.5%, above its budget (amber lip) and within 10%.
    const [above, near, under, far] = recapDayCups(
      '2026-11-02',
      [day('2026-11-02', 2245, 2050), day('2026-11-03', 2029, 2030), day('2026-11-04', 1922, 2050), day('2026-11-05', 2600, 2100)],
      '2026-11-14',
    );
    expect(above.detail).toBe('Nov 2 · 2,245 of 2,050 kcal, 195 kcal above that day’s budget, within 10% of it');
    expect(near.detail).toBe('Nov 3 · 2,029 of 2,030 kcal, 99% of that day’s budget, within 10% of it');
    expect(under.detail).toBe('Nov 4 · 1,922 of 2,050 kcal, 93% of that day’s budget, within 10% of it');
    expect(far.detail).toBe('Nov 5 · 2,600 of 2,100 kcal, 500 kcal above that day’s budget');
    for (const c of [above, near, under, far]) expect(c.detail).not.toMatch(/110%|100%/);
  });

  it('has nothing to judge without a full day', () => {
    expect(recapDaysVerdict(recapDayCups('2026-11-09', [], '2026-11-10'))).toBe('No fully logged days to measure yet');
  });
});
