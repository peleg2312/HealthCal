import { describe, expect, it } from 'vitest';

import { looseDate, projectTo, rangeShort, rangeText, shortDate } from './projection';

const NOW = new Date(2026, 10, 13, 12);

describe('projection', () => {
  it('runs from the current weight to the target at the planned pace, with a band either side', () => {
    const p = projectTo(80, 72, -0.5, NOW)!;
    expect(p.weeks).toBe(16);
    expect(p.fastWeeks).toBeCloseTo(12.8, 5);
    expect(p.slowWeeks).toBeCloseTo(21.33, 2);
    expect(p.fastDate < p.date && p.date < p.slowDate).toBe(true);
    expect(p.waypoints.map((w) => w.kg)).toEqual([78, 76, 74]);
    expect(shortDate(p.waypoints[1].date)).toBe('Jan 8');
    expect(shortDate(p.date)).toBe('Mar 5');
  });

  it('works for gaining too', () => {
    const p = projectTo(70, 74, 0.25, NOW)!;
    expect(p.weeks).toBe(16);
    expect(p.waypoints[0].kg).toBe(71);
  });

  it('has no road without a usable target or pace', () => {
    expect(projectTo(80, undefined, -0.5, NOW)).toBeNull();
    expect(projectTo(80, 72, 0, NOW)).toBeNull();
    expect(projectTo(80, 72, 0.5, NOW)).toBeNull();
    expect(projectTo(80, 79.8, -0.5, NOW)).toBeNull();
  });

  it('describes the date range loosely', () => {
    const p = projectTo(80, 72, -0.5, NOW)!;
    expect(rangeText(p, NOW)).toBe('between mid February and mid April 2027');
    expect(looseDate(new Date(2026, 11, 25), NOW)).toBe('late December');
    expect(looseDate(new Date(2026, 11, 15), NOW)).toBe('mid December');
    // Across a new year both years are named.
    expect(rangeText(projectTo(80, 76, -0.5, NOW)!, NOW)).toBe('between late December and late January 2027');
  });

  it("labels the chart's goal with the title's months, never a day", () => {
    const p = projectTo(80, 72, -0.5, NOW)!;
    expect(rangeText(p, NOW)).toBe('between mid February and mid April 2027');
    expect(rangeShort(p, NOW)).toBe('Mid Feb to mid Apr');
    expect(rangeShort(projectTo(80, 76, -0.5, NOW)!, NOW)).toBe('Late Dec to late Jan');
    // A short road whose two ends land in the same part of a month: one phrase, as the title says it.
    const near = { ...p, fastDate: new Date(2027, 2, 12), slowDate: new Date(2027, 2, 18) };
    expect(rangeText(near, NOW)).toBe('around mid March 2027');
    expect(rangeShort(near, NOW)).toBe('Around mid Mar');
    // A road a year long whose ends share a part and a month names both years.
    const long = { ...p, fastDate: new Date(2027, 2, 14), slowDate: new Date(2028, 2, 16) };
    expect(rangeShort(long, NOW)).toBe('Mid Mar 2027 to mid Mar 2028');
    expect(rangeShort(p, NOW)).not.toMatch(/\d/);
  });
});
