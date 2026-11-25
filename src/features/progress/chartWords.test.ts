import { describe, expect, it } from 'vitest';

import { barsLabel, chartLabel, evenly, sleepChartLabel, spokenUnits, waterChartLabel, weightChartLabel } from './chartWords';

describe('chart words', () => {
  it('speaks units and days in full', () => {
    expect(spokenUnits('Mon 1.2 L, Tue 250 ml, 8.5 fl oz, 1,980 kcal, 7 h 15 min, 1 h, 80.2 kg, 146 g')).toBe(
      'Monday 1.2 litres, Tuesday 250 millilitres, 8.5 fluid ounces, 1,980 kilocalories, 7 hours 15 minutes, 1 hour, 80.2 kilograms, 146 grams',
    );
    expect(spokenUnits('Monday, 5 min, 3 mi')).toBe('Monday, 5 minutes, 3 miles');
  });

  it('puts the summary first and every value after it', () => {
    expect(chartLabel('Water by day.', ['Mon 1 L', 'today 250 ml'])).toBe('Water by day. Monday 1 litres, today 250 millilitres.');
    expect(chartLabel('Nothing yet', [])).toBe('Nothing yet.');
  });

  it('names water by day with the goal and the days it was met', () => {
    const days = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'].map((date, i) => ({ date, ml: i === 6 ? 1230 : i * 700, goalMl: 3300 }));
    const label = waterChartLabel(days, '2026-11-24', 'metric');
    expect(label.startsWith('Water by day, Nov 18 to today, goal 3.3 litres, reached on 1 of 7 days.')).toBe(true);
    expect(label).toContain('Wednesday none');
    expect(label).toContain('today 1.23 litres.');
    expect(label.split(', ').length).toBeGreaterThan(7);
  });

  it('names every night, the unlogged ones too', () => {
    const label = sleepChartLabel(
      [
        { date: '2026-11-23', hours: 7.25 },
        { date: '2026-11-24', hours: 0 },
      ],
      '2026-11-24',
    );
    expect(label).toBe('Sleep by night, last 2 nights, 1 logged, the 7 to 9 hour range shaded. Monday 7 hours 15 minutes, today not logged.');
  });

  it('gives a weight line its range, goal and evenly spaced values', () => {
    const trend = Array.from({ length: 40 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, kg: 80 - i * 0.05, trend: 80 - i * 0.04, interpolated: i % 2 === 1 }))
      .filter((p) => p.date <= '2026-10-31')
      .concat(Array.from({ length: 24 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, kg: 79, trend: 78.8, interpolated: false })));
    const label = weightChartLabel(trend, '1m', '2026-11-24', 'metric', 74);
    expect(label).toContain('goal 74.0 kilograms');
    expect(label).toContain('Oct 25 to today: 79.0 kilograms to 78.8 kilograms');
    expect(label).toContain('every weigh-in is listed under History');
    expect(label.endsWith('today 78.8 kilograms.')).toBe(true);
  });

  it('reads bar details as "day: value"', () => {
    expect(barsLabel('Calories a day', ['Nov 3 · 1,980 of 2,190 kcal', undefined, 'Nov 4 · not logged'])).toBe('Calories a day. Nov 3: 1,980 of 2,190 kilocalories, Nov 4: not logged.');
  });

  it('keeps the first and last of an even sample', () => {
    expect(evenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
    expect(evenly([1, 2], 4)).toEqual([1, 2]);
  });
});
