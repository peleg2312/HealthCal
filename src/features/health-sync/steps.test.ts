/**
 * Daily steps: the store's day totals as kept, the right calendar day's
 * midnight in any time zone, the 35-day window, and the words on Train.
 */
import { describe, expect, it } from 'vitest';

import { mergeStepDays, oldestStepDay, pruneStepDays, stepDaysFromTotals, stepsLine, stepsReadRange, stepsWeek, STEP_DAYS, zoneClock } from './steps';

const at = (iso: string) => Date.parse(iso);

describe('the store\'s day totals', () => {
  it('keeps whole counts for real days with steps', () => {
    expect(stepDaysFromTotals([{ day: '2026-11-12', count: 7950.4 }, { day: '2026-11-13', count: 0 }, { day: '2026-11-14', count: 1520 }])).toEqual({ '2026-11-12': 7950, '2026-11-14': 1520 });
    expect(stepDaysFromTotals([])).toEqual({});
    expect(stepDaysFromTotals([{ day: 'yesterday', count: 900 }, { day: '2026-11-12', count: Number.NaN }, { day: '2026-11-12', count: -4 }])).toEqual({});
  });

  it('adds up a day that comes in two parts, and does not merge apps itself (the store has done that)', () => {
    expect(stepDaysFromTotals([{ day: '2026-11-12', count: 3000.5 }, { day: '2026-11-12', count: 999.6 }])).toEqual({ '2026-11-12': 4000 });
  });

  it('finds local midnight in zones with half- and three-quarter-hour offsets and on clock-change days', () => {
    expect(new Date(zoneClock('Asia/Kolkata').midnightOf('2026-11-13')).toISOString()).toBe('2026-11-12T18:30:00.000Z');
    expect(new Date(zoneClock('Asia/Kathmandu').midnightOf('2026-11-13')).toISOString()).toBe('2026-11-12T18:15:00.000Z');
    expect(new Date(zoneClock('Europe/Amsterdam').midnightOf('2026-10-25')).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(new Date(zoneClock('Europe/Amsterdam').midnightOf('2026-03-29')).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(zoneClock('America/New_York').dayOf(at('2026-11-13T03:00:00Z'))).toBe('2026-11-12');
  });
});

describe('the 35-day window', () => {
  const ams = zoneClock('Europe/Amsterdam');
  const now = at('2026-11-14T10:00:00Z');

  it('reads all 35 days the first time, from local midnight', () => {
    const r = stepsReadRange(null, now, ams);
    expect(STEP_DAYS).toBe(35);
    expect(r.fromDay).toBe('2026-10-11');
    expect(oldestStepDay('2026-11-14')).toBe('2026-10-11');
    // Local midnight of Oct 11 in Amsterdam (summer time, UTC+2).
    expect(r.from).toBe('2026-10-10T22:00:00.000Z');
    expect(r.to).toBe(new Date(now).toISOString());
  });

  it('then re-reads the last three days, or from the day before the last read after a pause, never past the window', () => {
    expect(stepsReadRange('2026-11-14T09:45:00Z', now, ams).fromDay).toBe('2026-11-12');
    expect(stepsReadRange('2026-11-05T09:45:00Z', now, ams).fromDay).toBe('2026-11-04');
    expect(stepsReadRange('2026-08-01T09:45:00Z', now, ams).fromDay).toBe('2026-10-11');
    expect(stepsReadRange('garbage', now, ams).fromDay).toBe('2026-10-11');
    // A clock set back: the last read is "in the future"; the usual three days.
    expect(stepsReadRange('2027-01-01T00:00:00Z', now, ams).fromDay).toBe('2026-11-12');
  });

  it('keeps stored days before the re-read, takes the re-read days as read, and drops days older than 35', () => {
    const stored = { '2026-10-01': 5000, '2026-10-11': 6000, '2026-11-11': 7000, '2026-11-12': 100, '2026-11-13': 8000 };
    const read = { '2026-11-12': 9000, '2026-11-14': 1500 };
    // The 13th was re-read and has no steps now (they were deleted): it goes.
    expect(mergeStepDays(stored, read, '2026-11-12', '2026-11-14')).toEqual({ '2026-10-11': 6000, '2026-11-11': 7000, '2026-11-12': 9000, '2026-11-14': 1500 });
    expect(pruneStepDays(stored, '2026-11-14')).toEqual({ '2026-10-11': 6000, '2026-11-11': 7000, '2026-11-12': 100, '2026-11-13': 8000 });
  });
});

describe('the line on Train', () => {
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];

  it('shows today and the average of the week\'s earlier days that have steps', () => {
    const days = { '2026-11-09': 8000, '2026-11-10': 7900, '2026-11-12': 7950, '2026-11-14': 8432 };
    const w = stepsWeek(days, week, '2026-11-14');
    // The 11th and 13th have no steps (the phone was off) and are not counted as 0.
    expect(w).toEqual({ today: 8432, average: 7950, averageDays: 3, thisWeek: true });
    expect(stepsLine(w!)).toBe('8,432 steps today, 7,950 a day this week');
    // A phone under 360 px: the card is the week's, so "this week" goes and the line stays one line.
    expect(stepsLine(w!, true)).toBe('8,432 steps today, 7,950 a day');
    expect(stepsLine({ today: null, average: 7950, averageDays: 3, thisWeek: false }, true)).toBe('7,950 steps a day that week');
  });

  it('on Monday shows only today, and without steps today only the average', () => {
    expect(stepsLine(stepsWeek({ '2026-11-09': 3120 }, week, '2026-11-09')!)).toBe('3,120 steps today');
    expect(stepsLine(stepsWeek({ '2026-11-09': 1 }, week, '2026-11-09')!)).toBe('1 step today');
    expect(stepsLine(stepsWeek({ '2026-11-09': 6000, '2026-11-10': 9000 }, week, '2026-11-11')!)).toBe('7,500 steps a day this week');
  });

  it('for an earlier week shows that week\'s average, and nothing for a week without steps', () => {
    expect(stepsLine(stepsWeek({ '2026-11-09': 6000, '2026-11-15': 8000 }, week, '2026-11-20')!)).toBe('7,000 steps a day that week');
    expect(stepsWeek({}, week, '2026-11-14')).toBeNull();
    expect(stepsWeek({ '2026-11-16': 9000 }, week, '2026-11-16')).toBeNull();
  });
});
