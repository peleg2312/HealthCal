import { describe, expect, it } from 'vitest';

import { navyBodyFatPct } from '@/lib/body';
import { weightTrend } from '@/lib/trend';
import type { SleepEntry, SleepQuality } from '@/types';

import {
  bodyFatText,
  clampFastStart,
  crossedGoal,
  fastingLabel,
  fastProgress,
  findByDate,
  formatClockDuration,
  formatHours,
  hoursFigure,
  hoursSpoken,
  isMostRecentDate,
  MAX_START_BACK_MS,
  normalizePresets,
  relativeDayTime,
  sleepSummary,
  WEIGHT_RANGES,
  weightAxisLabels,
  weightChartData,
  weightRangeFrom,
  weightRangeSummary,
  weightStats,
} from './helpers';

describe('common', () => {
  it('finds a record by date and checks recency', () => {
    const list = [{ date: '2026-11-10' }, { date: '2026-11-12' }];
    expect(findByDate(list, '2026-11-12')).toBe(list[1]);
    expect(findByDate(list, '2026-11-11')).toBeUndefined();
    expect(isMostRecentDate(list, '2026-11-12')).toBe(true);
    expect(isMostRecentDate(list, '2026-11-13')).toBe(true);
    expect(isMostRecentDate(list, '2026-11-11')).toBe(false);
    expect(isMostRecentDate([], '2026-11-11')).toBe(true);
  });

  it('formats durations', () => {
    expect(formatClockDuration(0)).toBe('0:00:00');
    expect(formatClockDuration((16 * 3600 + 5 * 60 + 9) * 1000)).toBe('16:05:09');
    expect(formatClockDuration(-5000)).toBe('0:00:00');
    expect(formatHours(7.5)).toBe('7 h 30 min');
    expect(formatHours(9)).toBe('9 h');
    expect(formatHours(0.75)).toBe('45 min');
  });

  it('draws and says a night in hours and minutes, never decimal hours', () => {
    expect(hoursFigure(7.8)).toEqual({ value: '7 h 48', unit: 'min' });
    expect(hoursFigure(7.1)).toEqual({ value: '7 h 6', unit: 'min' });
    expect(hoursFigure(8)).toEqual({ value: '8', unit: 'h' });
    expect(hoursFigure(7.999)).toEqual({ value: '8', unit: 'h' });
    expect(hoursFigure(0.5)).toEqual({ value: '30', unit: 'min' });
    expect(hoursSpoken(7.8)).toBe('7 hours 48 minutes');
    expect(hoursSpoken(1)).toBe('1 hour');
    expect(hoursSpoken(1 + 1 / 60)).toBe('1 hour 1 minute');
    expect(hoursSpoken(0.25)).toBe('15 minutes');
  });
});

describe('water', () => {
  it('cleans preset sizes', () => {
    expect(normalizePresets([250, null, 250, 10, 500.4, 3000, 330])).toEqual([250, 500, 330]);
    expect(normalizePresets([100, 200, 300, 400, 500, 600, 700])).toHaveLength(6);
  });

  it('detects the moment the goal is crossed', () => {
    expect(crossedGoal(1900, 2100, 2000)).toBe(true);
    expect(crossedGoal(2000, 2300, 2000)).toBe(false);
    expect(crossedGoal(1000, 1500, 2000)).toBe(false);
    expect(crossedGoal(0, 0, 0)).toBe(false);
  });
});

describe('weight', () => {
  const trend = weightTrend([
    { date: '2026-08-01', kg: 80 },
    { date: '2026-10-20', kg: 78 },
    { date: '2026-11-13', kg: 77 },
  ]);

  it('limits the chart to the range and keeps raw dots separate', () => {
    const all = weightChartData(trend, 'all', '2026-11-13');
    expect(all.line.length).toBe(trend.length);
    expect(all.dots).toHaveLength(3);
    expect(all.line[0].x).toBe(0);
    const month = weightChartData(trend, '1m', '2026-11-13');
    expect(month.line).toHaveLength(31);
    expect(month.dots).toHaveLength(2);
    expect(month.labels).toEqual(['Oct 14', 'Oct 29', 'Nov 13']);
  });

  it('draws 6 months and a year, and labels a long span by month with its year', () => {
    const long = weightTrend([
      { date: '2025-09-01', kg: 84 },
      { date: '2026-11-13', kg: 77 },
    ]);
    expect(weightRangeFrom(long[0].date, '6m', '2026-11-13')).toBe('2026-05-15');
    expect(weightRangeFrom(long[0].date, '1y', '2026-11-13')).toBe('2025-11-13');
    expect(weightRangeFrom(long[0].date, 'all', '2026-11-13')).toBe('2025-09-01');
    expect(weightChartData(long, '1y', '2026-11-13').line).toHaveLength(366);
    expect(weightChartData(long, '1y', '2026-11-13').labels).toEqual(['Nov 2025', 'May', 'Nov 2026']);
    expect(weightAxisLabels('2026-10-01', '2026-11-13')).toEqual(['Oct 1', 'Oct 23', 'Nov 13']);
    expect(WEIGHT_RANGES.map((r) => r.label)).toEqual(['1M', '3M', '6M', '1Y', 'All']);
  });

  it("sums up a range's weigh-ins and the trend's change", () => {
    const s = weightRangeSummary(trend, '1m', '2026-11-13')!;
    expect(s).toMatchObject({ from: '2026-10-14', to: '2026-11-13', sinceFirst: false, weighIns: 2, averageKg: 77.5, lowKg: 77, highKg: 78 });
    expect(s.changeKg).toBeLessThan(0);
    expect(weightRangeSummary(trend, 'all', '2026-11-13')!.sinceFirst).toBe(true);
    expect(weightRangeSummary([], 'all', '2026-11-13')).toBeNull();
  });

  it('converts for display', () => {
    const lb = weightChartData(trend, 'all', '2026-11-13', (kg) => kg * 2);
    expect(lb.dots[0].y).toBe(160);
  });

  it('computes stats from the trend', () => {
    const s = weightStats(trend, 80, -0.3, 75)!;
    expect(s.trendKg).toBeCloseTo(trend[trend.length - 1].trend);
    expect(s.totalChangeKg).toBeLessThan(0);
    expect(s.toTargetKg).toBeLessThan(0);
    expect(weightStats([], 80, null)).toBeNull();
    expect(weightStats(trend, 80, null)!.toTargetKg).toBeNull();
  });
});

describe('body', () => {
  it('matches a hand calculation of the US Navy formula', () => {
    // Male, 178 cm, neck 38 cm, waist 85 cm.
    const inch = (cm: number) => cm / 2.54;
    const hand = 86.01 * Math.log10(inch(85) - inch(38)) - 70.041 * Math.log10(inch(178)) + 36.76;
    expect(navyBodyFatPct({ sex: 'male', heightCm: 178, neckCm: 38, waistCm: 85 })).toBeCloseTo(hand, 1);
    expect(hand).toBeCloseTo(16.5, 1);
    // Female, 165 cm, neck 33, waist 72, hip 98.
    const f = 163.205 * Math.log10(inch(72) + inch(98) - inch(33)) - 97.684 * Math.log10(inch(165)) - 78.387;
    expect(navyBodyFatPct({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 72, hipCm: 98 })).toBeCloseTo(f, 1);
    expect(navyBodyFatPct({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 72 })).toBeNull();
  });

  it('shows body fat one way: a whole percent with no space', () => {
    expect(bodyFatText(18)).toBe('18%');
    expect(bodyFatText(18.2)).toBe('18%');
    expect(bodyFatText(15.7)).toBe('16%');
    // Only where two different readings would otherwise read the same.
    expect(bodyFatText(18.2, true)).toBe('18.2%');
  });
});

describe('sleep', () => {
  const e = (date: string, hours: number, quality?: SleepQuality): SleepEntry => ({ id: date, updatedAt: '', date, hours, ...(quality ? { quality } : {}) });

  it('summarises a window', () => {
    const s = sleepSummary([e('2026-11-13', 8, 4), e('2026-11-12', 6, 2), e('2026-11-01', 7, 3)], 7, '2026-11-13');
    expect(s.nights).toBe(2);
    expect(s.avgHours).toBe(7);
    expect(s.avgQuality).toBe(3);
    expect(s.inRange).toBe(1);
    expect(s.spreadHours).toBe(1);
    expect(s.series).toHaveLength(7);
    expect(s.series[6]).toEqual({ date: '2026-11-13', hours: 8 });
    expect(s.series[0].hours).toBe(0);
  });

  it('averages quality over the rated nights only', () => {
    const s = sleepSummary([e('2026-11-13', 8, 4), e('2026-11-12', 6), e('2026-11-11', 7, 2)], 7, '2026-11-13');
    expect(s.nights).toBe(3);
    expect(s.avgHours).toBe(7);
    expect(s.avgQuality).toBe(3);
    expect(sleepSummary([e('2026-11-13', 8), e('2026-11-12', 6)], 7, '2026-11-13').avgQuality).toBeNull();
  });

  it('handles no data', () => {
    const s = sleepSummary([], 30, '2026-11-13');
    expect(s.avgHours).toBeNull();
    expect(s.spreadHours).toBeNull();
  });
});

describe('fasting', () => {
  const start = '2026-11-12T20:00:00.000Z';
  const t = (h: number) => Date.parse(start) + h * 3600_000;

  it('derives progress from the stored start', () => {
    const p = fastProgress(start, 16, t(8));
    expect(p.progress).toBeCloseTo(0.5);
    expect(p.remainingMs).toBe(8 * 3600_000);
    expect(p.reached).toBe(false);
    expect(p.endsAt.getTime()).toBe(t(16));
    const done = fastProgress(start, 16, t(17));
    expect(done.reached).toBe(true);
    expect(done.remainingMs).toBe(0);
    const ended = fastProgress(start, 16, t(40), new Date(t(12)).toISOString());
    expect(ended.elapsedMs).toBe(12 * 3600_000);
  });

  it('keeps an edited start in the allowed window', () => {
    const now = t(5);
    expect(clampFastStart(now + 1000, now)).toBe(now);
    expect(clampFastStart(now - MAX_START_BACK_MS - 1, now)).toBe(now - MAX_START_BACK_MS);
    expect(clampFastStart(t(1), now)).toBe(t(1));
  });

  it('labels targets', () => {
    expect(fastingLabel(16)).toBe('16:8');
    expect(fastingLabel(13)).toBe('13:11');
    expect(fastingLabel(36)).toBe('36 h');
  });

  it('labels relative times', () => {
    const now = new Date(2026, 10, 13, 9, 0);
    expect(relativeDayTime(new Date(2026, 10, 13, 7, 5), now)).toBe('Today 07:05');
    expect(relativeDayTime(new Date(2026, 10, 12, 20, 15), now)).toBe('Yesterday 20:15');
    expect(relativeDayTime(new Date(2026, 10, 14, 4, 0), now)).toBe('Tomorrow 04:00');
  });
});
