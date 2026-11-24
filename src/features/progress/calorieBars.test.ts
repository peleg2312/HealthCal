import { describe, expect, it } from 'vitest';

import type { InsightDay } from '@/lib/insights';

import { buildBars, daysVerdict, solidBar } from './calorieBars';

const FILLS = { full: 'FULL', partial: 'PARTIAL', over: 'AMBER' };

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
    const { data, openIndex } = buildBars(days, '2026-11-14', FILLS);
    // Amber is the second segment, the part above that day's own budget.
    const amber = data.map((d) => d.segments?.find((s) => s.color === 'AMBER')?.value ?? 0);
    expect(amber).toEqual([0, 165, 0, 0]);
    expect(data[1].segments).toEqual([
      { value: 1920, color: 'FULL' },
      { value: 165, color: 'AMBER' },
    ]);
    // The kit adds no amber of its own on a solid bar (its goal is never below the value), so the level line sits at the day's intake.
    for (const d of data.slice(0, 3)) expect(d.value > (d.goal ?? Infinity)).toBe(false);
    // Today stays the kit's hatched bar, against today's budget.
    expect(openIndex).toBe(3);
    expect(data[3].goal).toBe(2100);
    expect(data[3].segments).toBeUndefined();
  });

  it('draw a partly logged day in the partial colour, but not today', () => {
    const { data } = buildBars(days, '2026-11-14', FILLS);
    expect(data.map((d) => d.segments?.[0]?.color)).toEqual(['FULL', 'FULL', 'PARTIAL', undefined]);
  });

  it('stack a solid bar: fill up to the budget, amber above, nothing for an empty day', () => {
    expect(solidBar(2400, 2000, 'F', 'A')).toEqual({ segments: [{ value: 2000, color: 'F' }, { value: 400, color: 'A' }], goal: 2400 });
    expect(solidBar(1500, 2000, 'F', 'A')).toEqual({ segments: [{ value: 1500, color: 'F' }], goal: 2000 });
    expect(solidBar(0, 2000, 'F', 'A')).toEqual({});
  });

  it('measure a weekly bar against the average budget of the same days', () => {
    const many = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(2026, 8, 1 + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return day(iso, 2000, i % 2 ? 2200 : 1800);
    });
    const { data, weekly } = buildBars(many, '2026-11-14', FILLS);
    expect(weekly).toBe(true);
    for (const b of data) if (b.value) expect(b.goal).toBeGreaterThan(1700);
    // 2,000 against an average budget of 2,000 or so: no amber unless the week's average was above its budget.
    for (const b of data) for (const s of b.segments ?? []) if (s.color === 'AMBER') expect(b.value).toBeGreaterThan(s.value);
  });

  it('say in words what the bars show: the recap headline, and the band under it', () => {
    // Oct 27 is 86% of its budget (no mark), Nov 11 above its own.
    expect(daysVerdict(days, '2026-11-14')).toEqual({ line: '0 of 2 days on budget, 1 above', note: 'On budget: a full day at 90 to 100% of its budget' });
    expect(daysVerdict([day('2026-11-10', 2600, 2000), day('2026-11-11', 2000, 2000)], '2026-11-14').line).toBe('1 of 2 days on budget, 1 above');
    // 2,050 of 2,000 is above its budget, never on it.
    expect(daysVerdict([day('2026-11-10', 2050, 2000), day('2026-11-11', 2000, 2000)], '2026-11-14').line).toBe('1 of 2 days on budget, 1 above');
    expect(daysVerdict([day('2026-11-10', 1850, 2000), day('2026-11-11', 2000, 2000)], '2026-11-14').line).toBe('All 2 days on budget');
    expect(daysVerdict([day('2026-11-11', 2000, 2000)], '2026-11-14')).toEqual({ line: 'The one full day on budget', note: 'On budget: a full day at 90 to 100% of its budget' });
    expect(daysVerdict([], '2026-11-14')).toEqual({ line: 'No fully logged days yet', note: null });
  });
});
