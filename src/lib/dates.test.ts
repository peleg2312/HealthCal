import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDays,
  ageFromBirthDate,
  diffDays,
  formatClock,
  formatDayLabel,
  formatDuration,
  formatHHmm,
  formatLongDate,
  formatShortDate,
  fromISODate,
  greeting,
  lastNDates,
  parseHHmm,
  startOfWeek,
  toISODate,
  today,
  weekdayShort,
} from './dates';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('toISODate / fromISODate', () => {
  it('uses the local calendar, zero padded', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59, 59))).toBe('2026-01-05');
    expect(toISODate(new Date(2026, 11, 31, 0, 0, 1))).toBe('2026-12-31');
  });
  it('round trips', () => {
    for (const s of ['2024-02-29', '2026-01-01', '2026-12-31', '1999-09-09']) expect(toISODate(fromISODate(s))).toBe(s);
  });
  it('late evening in a UTC+ zone is still the same local day (not the UTC day)', () => {
    process.env.TZ = 'Pacific/Auckland';
    expect(toISODate(new Date(2026, 5, 15, 1, 0))).toBe('2026-06-15'); // UTC would say 06-14
    process.env.TZ = 'America/Los_Angeles';
    expect(toISODate(new Date(2026, 5, 15, 23, 0))).toBe('2026-06-15'); // UTC would say 06-16
  });
});

describe('addDays / diffDays', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2024-02-28', 2, '2024-03-01'],
    ['2024-02-29', 365, '2025-02-28'],
    ['2025-12-31', 1, '2026-01-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2024-03-01', -1, '2024-02-29'],
    ['2026-06-15', 0, '2026-06-15'],
    ['2026-01-01', 365, '2027-01-01'],
    ['2024-01-01', 366, '2025-01-01'],
    ['2026-05-31', 31, '2026-07-01'],
  ])('%s %i -> %s', (d, n, e) => expect(addDays(d, n)).toBe(e));

  it('diffDays is signed and whole across leap day and year end', () => {
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2);
    expect(diffDays('2023-02-28', '2023-03-01')).toBe(1);
    expect(diffDays('2025-12-31', '2026-01-01')).toBe(1);
    expect(diffDays('2026-01-01', '2025-01-01')).toBe(-365);
    expect(diffDays('2026-06-15', '2026-06-15')).toBe(0);
  });

  it.each(['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'America/Sao_Paulo', 'Pacific/Apia'])(
    'stays exact across a full year of days in %s (DST changes)',
    (tz) => {
      process.env.TZ = tz;
      let d = '2026-01-01';
      for (let i = 0; i < 400; i++) {
        const next = addDays(d, 1);
        expect(diffDays(d, next)).toBe(1);
        d = next;
      }
      expect(d).toBe(addDays('2026-01-01', 400));
      expect(d).toBe('2027-02-05'); // 2026 has 365 days: +365 = 2027-01-01, +35 = 2027-02-05
      expect(diffDays('2026-01-01', d)).toBe(400);
    },
  );
  it('spring-forward and fall-back days in New York', () => {
    process.env.TZ = 'America/New_York';
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // 23 h day
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // 25 h day
    expect(diffDays('2026-03-08', '2026-03-09')).toBe(1);
    expect(diffDays('2026-11-01', '2026-11-02')).toBe(1);
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
  });
  it('DST in Lord Howe is a 30 minute shift and does not move the day', () => {
    process.env.TZ = 'Australia/Lord_Howe';
    expect(addDays('2026-10-03', 1)).toBe('2026-10-04');
    expect(addDays('2026-10-04', 1)).toBe('2026-10-05');
    expect(addDays('2026-04-04', 1)).toBe('2026-04-05');
    expect(diffDays('2026-10-04', '2026-10-05')).toBe(1);
  });
});

describe('lastNDates', () => {
  it('is inclusive, oldest first, crossing month and year', () => {
    expect(lastNDates(4, '2026-01-02')).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
    expect(lastNDates(1, '2026-01-02')).toEqual(['2026-01-02']);
    expect(lastNDates(0, '2026-01-02')).toEqual([]);
  });
  it('includes the leap day', () => {
    expect(lastNDates(3, '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });
});

describe('today', () => {
  it('follows the local clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 4, 23, 30));
    expect(today()).toBe('2026-07-04');
  });
});

describe('ageFromBirthDate', () => {
  const on = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
  it('day before, day of and day after the birthday', () => {
    expect(ageFromBirthDate('2000-06-15', on(2026, 6, 14))).toBe(25);
    expect(ageFromBirthDate('2000-06-15', on(2026, 6, 15))).toBe(26);
    expect(ageFromBirthDate('2000-06-15', on(2026, 6, 16))).toBe(26);
  });
  it('time of day does not matter on the birthday', () => {
    expect(ageFromBirthDate('2000-06-15', new Date(2026, 5, 15, 0, 0, 1))).toBe(26);
    expect(ageFromBirthDate('2000-06-15', new Date(2026, 5, 14, 23, 59, 59))).toBe(25);
  });
  it('earlier month in the year than the birth month', () => {
    expect(ageFromBirthDate('2000-12-31', on(2026, 1, 1))).toBe(25);
    expect(ageFromBirthDate('2000-01-01', on(2026, 12, 31))).toBe(26);
  });
  it('born on a leap day: birthday arrives on 1 March in common years', () => {
    expect(ageFromBirthDate('2000-02-29', on(2025, 2, 28))).toBe(24);
    expect(ageFromBirthDate('2000-02-29', on(2025, 3, 1))).toBe(25);
    expect(ageFromBirthDate('2000-02-29', on(2024, 2, 28))).toBe(23);
    expect(ageFromBirthDate('2000-02-29', on(2024, 2, 29))).toBe(24);
  });
  it('same day as birth is 0; a future birth date is clamped to 0', () => {
    expect(ageFromBirthDate('2026-06-15', on(2026, 6, 15))).toBe(0);
    expect(ageFromBirthDate('2030-01-01', on(2026, 6, 15))).toBe(0);
  });
  it('defaults to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    expect(ageFromBirthDate('1996-06-15')).toBe(30);
  });
});

describe('startOfWeek (Monday based)', () => {
  it.each([
    ['2024-01-01', '2024-01-01'], // Monday
    ['2024-01-03', '2024-01-01'], // Wednesday
    ['2024-01-07', '2024-01-01'], // Sunday belongs to the week that started Monday 1st
    ['2024-01-08', '2024-01-08'],
    ['2024-03-03', '2024-02-26'], // Sunday, crossing the leap day / month
    ['2025-01-01', '2024-12-30'], // Wednesday, crossing the year
    ['2026-01-04', '2025-12-29'], // Sunday
  ])('%s -> %s', (d, e) => expect(startOfWeek(d)).toBe(e));
  it('is idempotent and always a Monday', () => {
    let d = '2026-01-01';
    for (let i = 0; i < 60; i++) {
      const s = startOfWeek(d);
      expect(weekdayShort(s)).toBe('Mon');
      expect(startOfWeek(s)).toBe(s);
      expect(diffDays(s, d)).toBeLessThanOrEqual(6);
      expect(diffDays(s, d)).toBeGreaterThanOrEqual(0);
      d = addDays(d, 1);
    }
  });
  it('is stable across a DST change', () => {
    process.env.TZ = 'America/New_York';
    expect(startOfWeek('2026-03-08')).toBe('2026-03-02'); // spring-forward Sunday
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // fall-back Sunday
  });
});

describe('labels', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12)); // a Monday: 2024-01-01 Monday + 897 days (128 weeks + 1) -> Tuesday? checked below
  });
  it('weekdayShort uses a known anchor: 2024-01-01 was a Monday', () => {
    expect(weekdayShort('2024-01-01')).toBe('Mon');
    expect(weekdayShort('2024-02-29')).toBe('Thu');
    expect(weekdayShort('2000-01-01')).toBe('Sat');
  });
  it('Today / Yesterday / Tomorrow, then Weekday, Mon D', () => {
    expect(formatDayLabel('2026-06-15')).toBe('Today');
    expect(formatDayLabel('2026-06-14')).toBe('Yesterday');
    expect(formatDayLabel('2026-06-16')).toBe('Tomorrow');
    expect(formatDayLabel('2024-02-29')).toBe('Thu, Feb 29');
  });
  it('short and long dates', () => {
    expect(formatShortDate('2026-01-05')).toBe('Jan 5');
    expect(formatLongDate('2000-01-01')).toBe('Sat, Jan 1, 2000');
  });
});

describe('time helpers', () => {
  it('parseHHmm', () => {
    expect(parseHHmm('00:00')).toBe(0);
    expect(parseHHmm('07:30')).toBe(450);
    expect(parseHHmm('23:59')).toBe(1439);
    expect(parseHHmm('garbage')).toBe(0);
  });
  it('formatHHmm wraps around midnight in both directions', () => {
    expect(formatHHmm(0)).toBe('00:00');
    expect(formatHHmm(450)).toBe('07:30');
    expect(formatHHmm(1440)).toBe('00:00');
    expect(formatHHmm(1500)).toBe('01:00');
    expect(formatHHmm(-30)).toBe('23:30');
    expect(formatHHmm(59.6)).toBe('01:00');
  });
  it('formatClock 12h', () => {
    expect(formatClock('00:05', true)).toBe('12:05 AM');
    expect(formatClock('12:00', true)).toBe('12:00 PM');
    expect(formatClock('13:30', true)).toBe('1:30 PM');
    expect(formatClock('23:59', true)).toBe('11:59 PM');
    expect(formatClock('09:05', true)).toBe('9:05 AM');
    expect(formatClock('13:30')).toBe('13:30');
  });
  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(59)).toBe('59 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(61)).toBe('1 h 1 min');
    expect(formatDuration(119.6)).toBe('2 h');
    expect(formatDuration(150)).toBe('2 h 30 min');
  });
  it('greeting boundaries', () => {
    const g = (h: number, m = 0) => greeting(new Date(2026, 0, 1, h, m));
    expect(g(4, 59)).toBe('Good night');
    expect(g(5)).toBe('Good morning');
    expect(g(11, 59)).toBe('Good morning');
    expect(g(12)).toBe('Good afternoon');
    expect(g(17, 59)).toBe('Good afternoon');
    expect(g(18)).toBe('Good evening');
    expect(g(23, 59)).toBe('Good evening');
    expect(g(0)).toBe('Good night');
  });
});
