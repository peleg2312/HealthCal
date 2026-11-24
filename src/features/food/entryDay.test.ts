import { describe, expect, it } from 'vitest';

import { canStepForward, ENTRY_DAYS_AHEAD, entryDayLabel, entryDaySpoken, foodLatestDay } from './entryDay';

const today = '2026-11-24';

describe('the day of an entry', () => {
  it('names the day one way: relative words near today, else the weekday and date', () => {
    expect(entryDayLabel('2026-11-24', today)).toBe('Today');
    expect(entryDayLabel('2026-11-23', today)).toBe('Yesterday');
    expect(entryDayLabel('2026-11-25', today)).toBe('Tomorrow');
    expect(entryDayLabel('2026-11-14', today)).toBe('Sat, Nov 14');
    expect(entryDayLabel('2026-12-01', today)).toBe('Tue, Dec 1');
  });
  it('carries the year only for a day in another year', () => {
    expect(entryDayLabel('2025-11-14', today)).toBe('Fri, Nov 14, 2025');
    expect(entryDayLabel('2026-01-02', '2027-01-01')).toBe('Fri, Jan 2, 2026');
    expect(entryDayLabel('2026-12-31', '2027-01-01')).toBe('Yesterday');
  });
  it('speaks the full date and how to come back to today', () => {
    expect(entryDaySpoken(today, today)).toBe('Today, Tue, Nov 24, 2026');
    expect(entryDaySpoken('2026-11-23', today)).toBe('Yesterday, Mon, Nov 23, 2026. Tap for today');
    expect(entryDaySpoken('2026-11-14', today)).toBe('Sat, Nov 14, 2026. Tap for today');
  });
  it('food goes as far ahead as the diary (a week), never further', () => {
    expect(ENTRY_DAYS_AHEAD).toBe(7);
    const latest = foodLatestDay(today);
    expect(latest).toBe('2026-12-01');
    expect(canStepForward('2026-11-30', latest)).toBe(true);
    expect(canStepForward('2026-12-01', latest)).toBe(false);
    expect(canStepForward('2026-12-05', latest)).toBe(false);
  });
  it('a workout stops at today', () => {
    expect(canStepForward('2026-11-23', today)).toBe(true);
    expect(canStepForward(today, today)).toBe(false);
  });
});
