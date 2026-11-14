import { describe, expect, it } from 'vitest';

import { weightTrend } from '@/lib/trend';

import { weightCell } from './weightCell';

const entries = [
  { date: '2026-11-01', kg: 80 },
  { date: '2026-11-09', kg: 78.3 },
  { date: '2026-11-14', kg: 78.8 },
];
const trend = weightTrend(entries);

describe('weightCell', () => {
  it('is the trend today, labelled as the trend', () => {
    const v = weightCell(entries, trend, '2026-11-14', true);
    expect(v?.label).toBe('Weight trend');
    expect(v?.kg).toBeCloseTo(trend[trend.length - 1].trend, 5);
  });
  it('is that day’s weigh-in on a past day that has one', () => {
    expect(weightCell(entries, trend, '2026-11-09', false)).toEqual({ label: 'Weighed', kg: 78.3 });
  });
  it('is the trend as it stood on a past day without one', () => {
    const v = weightCell(entries, trend, '2026-11-05', false);
    expect(v?.label).toBe('Weight trend');
    expect(v?.kg).toBeCloseTo(trend.find((t) => t.date === '2026-11-05')!.trend, 5);
  });
  it('is nothing before the first weigh-in', () => {
    expect(weightCell(entries, trend, '2026-10-20', false)).toBeNull();
    expect(weightCell([], [], '2026-11-14', true)).toBeNull();
  });
});
