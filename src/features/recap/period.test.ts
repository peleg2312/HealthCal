import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';

import {
  countedSpan,
  cupCell,
  defaultMonth,
  defaultYear,
  monthPeriod,
  monthRows,
  monthsSince,
  monthTallies,
  parseMonthKey,
  parseYearKey,
  periodTally,
  yearPeriod,
  yearRows,
  yearsSince,
  type DayFacts,
} from './period';

const day = (date: string, kcal: number, budget = 2000, complete = kcal >= 1000): DayFacts => ({ date, logged: kcal > 0, complete, kcal, budget });
const map = (days: DayFacts[]) => new Map(days.map((d) => [d.date, d]));

describe('keys and periods', () => {
  it('reads only real months and years from a search param', () => {
    expect(parseMonthKey('2026-10')).toBe('2026-10');
    expect(parseMonthKey(['2026-01'])).toBe('2026-01');
    for (const bad of ['2026-13', '2026-1', '26-10', '1999-12', '2026-10-01', '', undefined, 5]) expect(parseMonthKey(bad)).toBeNull();
    expect(parseYearKey('2026')).toBe('2026');
    for (const bad of ['26', '1999', '2101', '2026-01', undefined]) expect(parseYearKey(bad)).toBeNull();
  });

  it('knows each month’s length, February in a leap year included', () => {
    expect(monthPeriod('2026-02')).toEqual({ kind: 'month', key: '2026-02', start: '2026-02-01', end: '2026-02-28' });
    expect(monthPeriod('2028-02').end).toBe('2028-02-29');
    expect(yearPeriod('2026')).toEqual({ kind: 'year', key: '2026', start: '2026-01-01', end: '2026-12-31' });
  });

  it('opens on the last month that has ended, or this month when nothing came before it', () => {
    expect(defaultMonth('2026-11-25', '2026-03-02')).toBe('2026-10');
    expect(defaultMonth('2026-11-25', '2026-11-03')).toBe('2026-11');
    expect(defaultMonth('2026-01-03', '2025-06-01')).toBe('2025-12');
    expect(defaultMonth('2026-11-25', null)).toBe('2026-11');
  });

  it('opens on this year, or on the year just ended in the first week of January', () => {
    expect(defaultYear('2026-11-25', '2025-01-01')).toBe('2026');
    expect(defaultYear('2027-01-05', '2026-03-01')).toBe('2026');
    expect(defaultYear('2027-01-08', '2026-03-01')).toBe('2027');
    expect(defaultYear('2027-01-05', '2027-01-02')).toBe('2027');
  });

  it('lists months and years from the first record, newest first', () => {
    expect(monthsSince('2026-09-20', '2026-11-25')).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(monthsSince(null, '2026-11-25')).toEqual(['2026-11']);
    expect(monthsSince('2024-01-01', '2026-11-25', 3)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(yearsSince('2024-12-31', '2026-11-25')).toEqual(['2026', '2025', '2024']);
  });
});

describe('cups', () => {
  it('fills a day to its own budget and marks it by the shared rules', () => {
    const t = '2026-11-25';
    expect(cupCell('2026-11-10', day('2026-11-10', 1900), t)).toMatchObject({ ratio: 0.95, onBudget: true, over: false, partial: false });
    // Above its budget: amber, never the check.
    expect(cupCell('2026-11-10', day('2026-11-10', 2100), t)).toMatchObject({ over: true, onBudget: false });
    // Partly logged: the lighter fill, never judged.
    expect(cupCell('2026-11-10', day('2026-11-10', 400, 2000, false), t)).toMatchObject({ partial: true, onBudget: false });
    // Today is open, never partial.
    expect(cupCell(t, day(t, 400, 2000, false), t)).toMatchObject({ isToday: true, partial: false });
    // A day to come shows nothing logged, whatever is stored.
    expect(cupCell('2026-11-26', day('2026-11-26', 900), t)).toMatchObject({ future: true, logged: false, ratio: 0 });
    // Not logged: an empty cup.
    expect(cupCell('2026-11-10', undefined, t)).toMatchObject({ logged: false, ratio: 0, onBudget: false, over: false });
  });

  it('lays a month out in Monday-first weeks with no cup before the first record', () => {
    // 2026-10-01 is a Thursday.
    const rows = monthRows(monthPeriod('2026-10'), map([day('2026-10-05', 1900)]), '2026-11-25', '2026-10-03');
    expect(rows).toHaveLength(5);
    expect(rows[0].cells.slice(0, 3)).toEqual([null, null, null]);
    // Oct 1 and 2 are before the first record: no cup; Oct 3 has one.
    expect(rows[0].cells[3]).toBeNull();
    expect(rows[0].cells[4]).toBeNull();
    expect(rows[0].cells[5]?.date).toBe('2026-10-03');
    expect(rows.flatMap((r) => r.cells).filter(Boolean)).toHaveLength(29);
    expect(rows.every((r) => r.cells.length === 7)).toBe(true);
  });

  it('draws a year as a row per month that has begun, from the first record’s month, ending at today', () => {
    const rows = yearRows(yearPeriod('2026'), map([]), '2026-11-25', '2026-09-15');
    expect(rows.map((r) => r.label)).toEqual(['Sep', 'Oct', 'Nov']);
    expect(rows.every((r) => r.cells.length === 31)).toBe(true);
    // September: no cup before the 15th, none on a 31st that does not exist.
    expect(rows[0].cells.slice(0, 14).every((c) => c === null)).toBe(true);
    expect(rows[0].cells[14]?.date).toBe('2026-09-15');
    expect(rows[0].cells[30]).toBeNull();
    // November ends at today: no day still to come in a year's picture.
    expect(rows[2].cells.filter(Boolean)).toHaveLength(25);
    expect(rows[2].cells.some((c) => c?.future)).toBe(false);
    // A year before the first record, or not begun, has no rows.
    expect(yearRows(yearPeriod('2025'), map([]), '2026-11-25', '2026-09-15')).toEqual([]);
    expect(yearRows(yearPeriod('2027'), map([]), '2026-11-25', '2026-09-15')).toEqual([]);
    // A whole year that has ended: twelve rows.
    expect(yearRows(yearPeriod('2025'), map([]), '2026-11-25', '2024-02-01')).toHaveLength(12);
  });
});

describe('tally', () => {
  it('counts only from the first record to today, with the shared on-budget rule', () => {
    const p = monthPeriod('2026-11');
    const days = [day('2026-11-03', 1900), day('2026-11-04', 2300), day('2026-11-05', 1500), day('2026-11-06', 300, 2000, false), day('2026-11-25', 800, 2000, false)];
    const t = periodTally(p, map(days), '2026-11-25', '2026-11-03');
    expect(t).toMatchObject({ from: '2026-11-03', to: '2026-11-25', elapsed: 23, logged: 5, partial: 1 });
    expect(t.counts).toEqual({ full: 3, on: 1, above: 1 });
  });

  it('has nothing to count before the first record or for a period not begun', () => {
    expect(periodTally(monthPeriod('2026-08'), map([]), '2026-11-25', '2026-09-01')).toMatchObject({ elapsed: 0, logged: 0, from: null });
    expect(countedSpan(monthPeriod('2026-12'), '2026-11-25', '2026-09-01')).toBeNull();
    expect(countedSpan(yearPeriod('2026'), '2026-11-25', null)).toBeNull();
  });

  it('counts each month of a year, newest first', () => {
    const logged = new Set(['2026-10-01', '2026-10-02', '2026-11-20']);
    expect(monthTallies(yearPeriod('2026'), logged, '2026-11-25', '2026-09-28')).toEqual([
      { month: '2026-11', logged: 1, elapsed: 25 },
      { month: '2026-10', logged: 2, elapsed: 31 },
      { month: '2026-09', logged: 0, elapsed: 3 },
    ]);
  });

  it('counts a whole year of days', () => {
    const days = Array.from({ length: 365 }, (_, i) => day(addDays('2025-01-01', i), i % 2 ? 1950 : 0));
    const t = periodTally(yearPeriod('2025'), map(days), '2026-11-25', '2024-06-01');
    expect(t.elapsed).toBe(365);
    expect(t.logged).toBe(182);
    expect(t.counts.on).toBe(182);
  });
});
