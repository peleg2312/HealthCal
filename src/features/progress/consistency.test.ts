import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';

import {
  cleanTargets,
  longestStreak,
  monthGrid,
  monthTally,
  rhythmWeeks,
  shiftMonth,
  weeksOnRhythm,
  type CalendarDayInput,
} from './consistency';

// 2026-11-13 is a Friday; November 2026 starts on a Sunday.
const TODAY = '2026-11-13';

describe('longestStreak', () => {
  it('bridges single missed days but not two in a row', () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-08', '2026-10-09'];
    expect(longestStreak(dates)).toEqual({ length: 4, start: '2026-10-01', end: '2026-10-05' });
  });
  it('bridges every single missed day, not only the first', () => {
    const dates = ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07'];
    expect(longestStreak(dates).length).toBe(4);
  });
  it('is empty without data', () => {
    expect(longestStreak([])).toEqual({ length: 0, start: null, end: null });
  });
});

describe('month helpers', () => {
  it('steps across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-11', -13)).toBe('2025-10');
  });

  it('lays out Monday-first weeks and merges consecutive logged days into pills', () => {
    const map = new Map<string, CalendarDayInput>();
    const add = (date: string, o: Partial<CalendarDayInput> = {}) =>
      map.set(date, { date, logged: true, complete: true, kcal: 2000, budget: 2000, waterMet: false, trained: false, ...o });
    add('2026-11-01'); // Sunday, alone at the end of row 1
    add('2026-11-02'); // Monday, starts row 2: a new pill
    add('2026-11-03', { kcal: 2600 }); // over the band: logged but not on budget
    add('2026-11-05', { waterMet: true, trained: true });
    add('2026-11-20'); // future: ignored
    const rows = monthGrid('2026-11', map, TODAY);
    expect(rows[0].slice(0, 6).every((c) => c === null)).toBe(true);
    const nov1 = rows[0][6]!;
    expect(nov1).toMatchObject({ day: 1, logged: true, onBudget: true, joinPrev: false, joinNext: false });
    const [mon, tue, wed, thu] = rows[1];
    expect(mon).toMatchObject({ joinPrev: false, joinNext: true });
    expect(tue).toMatchObject({ logged: true, onBudget: false, joinPrev: true, joinNext: false });
    expect(wed).toMatchObject({ logged: false });
    expect(thu).toMatchObject({ waterMet: true, trained: true, joinPrev: false });
    const nov20 = rows.flat().find((c) => c?.date === '2026-11-20')!;
    expect(nov20).toMatchObject({ future: true, logged: false });
    expect(rows.every((r) => r.length === 7)).toBe(true);
  });

  it('fills each day to its own budget, with the lighter fill for a partly logged day', () => {
    const map = new Map<string, CalendarDayInput>();
    const add = (date: string, o: Partial<CalendarDayInput> = {}) =>
      map.set(date, { date, logged: true, complete: true, kcal: 2000, budget: 2000, waterMet: false, trained: false, ...o });
    add('2026-11-02', { kcal: 2300 }); // 15% above its budget
    add('2026-11-03', { kcal: 2150 }); // 7.5% above: within 10%
    add('2026-11-04', { kcal: 500, complete: false }); // partly logged
    add('2026-11-13', { kcal: 900, complete: false }); // today, still open
    const cells = new Map(monthGrid('2026-11', map, TODAY).flat().filter((c) => c).map((c) => [c!.date, c!]));
    expect(cells.get('2026-11-02')).toMatchObject({ ratio: 1.15, onBudget: false, partial: false });
    expect(cells.get('2026-11-03')).toMatchObject({ ratio: 1.075, onBudget: true });
    // A partly logged day near its budget is never checked: the check is for fully logged days.
    expect(cells.get('2026-11-04')).toMatchObject({ ratio: 0.25, onBudget: false, partial: true });
    expect(cells.get('2026-11-13')).toMatchObject({ ratio: 0.45, partial: false, isToday: true });
    expect(cells.get('2026-11-05')).toMatchObject({ ratio: 0, logged: false });
  });

  it('counts the month so far', () => {
    const logged = new Set(['2026-11-01', '2026-11-02', '2026-11-12', '2026-11-14', '2026-10-31']);
    expect(monthTally('2026-11', logged, TODAY)).toEqual({ logged: 3, elapsed: 13 });
    expect(monthTally('2026-10', logged, TODAY)).toEqual({ logged: 1, elapsed: 31 });
  });
});

describe('weekly rhythm', () => {
  it('clamps stored targets to 1 to 7 days', () => {
    expect(cleanTargets(undefined)).toEqual({ food: 5, train: 3, weigh: 2 });
    expect(cleanTargets({ food: 9, train: 0, weigh: 'x' })).toEqual({ food: 7, train: 1, weigh: 2 });
  });

  it('counts days per Monday week, marking the current one as partial', () => {
    // Mon Nov 9 .. Fri Nov 13 this week; Nov 2 .. Nov 8 last week.
    const dates = new Set(['2026-11-09', '2026-11-11', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-08', '2026-11-14']);
    const weeks = rhythmWeeks(dates, 3, TODAY, 3);
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
    expect(weeks.map((w) => w.count)).toEqual([0, 4, 2]);
    expect(weeks.map((w) => w.partial)).toEqual([false, false, true]);
    expect(weeks.map((w) => w.met)).toEqual([false, true, false]);
  });

  it('counts weeks on rhythm in total, not in a row', () => {
    const food = new Set<string>();
    const train = new Set<string>();
    const weigh = new Set<string>();
    // Week of Oct 19: all met. Oct 26: food short. Nov 2: all met. Nov 9 (current): not yet.
    for (const w of ['2026-10-19', '2026-11-02']) {
      for (let d = 0; d < 5; d++) food.add(addDays(w, d));
      for (let d = 0; d < 3; d++) train.add(addDays(w, d));
      for (let d = 0; d < 2; d++) weigh.add(addDays(w, d));
    }
    for (let d = 0; d < 4; d++) food.add(addDays('2026-10-26', d));
    for (let d = 0; d < 3; d++) train.add(addDays('2026-10-26', d));
    for (let d = 0; d < 2; d++) weigh.add(addDays('2026-10-26', d));
    const targets = { food: 5, train: 3, weigh: 2 };
    expect(weeksOnRhythm({ food, train, weigh }, targets, '2026-10-19', TODAY)).toEqual({ total: 2, closed: 3 });
    // Meeting the targets this week adds it straight away.
    for (let d = 0; d < 5; d++) food.add(addDays('2026-11-09', d));
    for (let d = 0; d < 3; d++) train.add(addDays('2026-11-09', d));
    for (let d = 0; d < 2; d++) weigh.add(addDays('2026-11-09', d));
    expect(weeksOnRhythm({ food, train, weigh }, targets, '2026-10-19', TODAY).total).toBe(3);
    expect(weeksOnRhythm({ food, train, weigh }, targets, null, TODAY)).toEqual({ total: 0, closed: 0 });
  });
});
