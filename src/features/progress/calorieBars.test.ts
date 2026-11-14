import { describe, expect, it } from 'vitest';

import type { InsightDay } from '@/lib/insights';

import { buildBars, daysVerdict } from './calorieBars';

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

// The review's N1 cases: Oct 27 (2,209 of its own 2,568) sits above the 2,171 average but is
// under its budget; Nov 11 (2,085 of 1,920) sits below the average but is over its own.
const days = [day('2026-10-27', 2209, 2568), day('2026-11-11', 2085, 1920), day('2026-11-12', 300, 2000), day('2026-11-14', 900, 2100)];

describe('calorie bars', () => {
  it('give every daily bar its own budget, so amber means over that day', () => {
    const { data, openIndex } = buildBars(days, '2026-11-14', 'PARTIAL');
    expect(data.map((d) => d.goal)).toEqual([2568, 1920, 2000, 2100]);
    const over = data.map((d) => d.value > (d.goal ?? Infinity));
    expect(over).toEqual([false, true, false, false]);
    expect(openIndex).toBe(3);
  });

  it('draw a partly logged day in the partial colour, but not today', () => {
    const { data } = buildBars(days, '2026-11-14', 'PARTIAL');
    expect(data.map((d) => d.color)).toEqual([undefined, undefined, 'PARTIAL', undefined]);
  });

  it('measure a weekly bar against the average budget of the same days', () => {
    const many = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(2026, 8, 1 + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return day(iso, 2000, i % 2 ? 2200 : 1800);
    });
    const { data, weekly } = buildBars(many, '2026-11-14');
    expect(weekly).toBe(true);
    for (const b of data) if (b.value) expect(b.goal).toBeGreaterThan(1700);
  });

  it('say in words what the bars show', () => {
    expect(daysVerdict(days, '2026-11-14')).toBe('1 of 2 full days within 10% of their budget');
    expect(daysVerdict([day('2026-11-10', 2600, 2000), day('2026-11-11', 2000, 2000)], '2026-11-14')).toBe('1 of 2 full days within 10% of their budget, 1 more than 10% above');
    expect(daysVerdict([], '2026-11-14')).toBe('No fully logged days yet');
  });
});
