import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';

import { keptDays } from '@/features/streak/kept';

import { weekCells, withKept, type WeekDayIn } from './weekCells';

const today = '2026-11-19';
const yesterday = '2026-11-18';

function day(date: string, over: Partial<WeekDayIn> = {}): WeekDayIn {
  return { date, kcal: 2000, budget: 2170, target: 2000, foodLogged: true, complete: true, approx: false, workout: false, ...over };
}

/** The seven days up to yesterday, oldest first. */
const week = Array.from({ length: 7 }, (_, i) => day(addDays(yesterday, i - 6)));

describe('weekCells', () => {
  it('draws six days before yesterday, then yesterday and today', () => {
    const w = weekCells({ days: week, todayDay: day(today, { kcal: 0, foodLogged: false, complete: false }), setupDay: '2026-10-01', yesterday, today });
    expect(w.show).toBe(true);
    expect(w.before.map((c) => c.date)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']);
    expect(w.yesterday?.date).toBe(yesterday);
    expect(w.today.date).toBe(today);
    expect(w.today.foodLogged).toBe(false);
  });

  it('never draws a day before setup', () => {
    const w = weekCells({ days: week, todayDay: null, setupDay: '2026-11-16', yesterday, today });
    expect(w.before.map((c) => c.date)).toEqual(['2026-11-16', '2026-11-17']);
  });

  it('on day 2 draws only Yesterday and Today', () => {
    const w = weekCells({ days: week, todayDay: null, setupDay: yesterday, yesterday, today });
    expect(w.before).toEqual([]);
    expect(w.yesterday?.date).toBe(yesterday);
    expect(w.show).toBe(true);
  });

  it('hides the picture when only Today would be drawn', () => {
    const w = weekCells({ days: week, todayDay: day(today), setupDay: today, yesterday, today });
    expect(w.yesterday).toBeNull();
    expect(w.before).toEqual([]);
    expect(w.show).toBe(false);
    expect(w.anyWorkout).toBe(false);
  });

  it('hides the picture when no drawn day before today has food', () => {
    const none = week.map((d) => ({ ...d, kcal: 0, foodLogged: false, complete: false, workout: true }));
    const w = weekCells({ days: none, todayDay: day(today), setupDay: null, yesterday, today });
    expect(w.show).toBe(false);
    expect(w.anyWorkout).toBe(false);
  });

  it('keeps the picture when only yesterday is empty', () => {
    const days = week.map((d) => (d.date === yesterday ? { ...d, kcal: 0, foodLogged: false, complete: false } : d));
    const w = weekCells({ days, todayDay: null, setupDay: null, yesterday, today });
    expect(w.show).toBe(true);
    expect(w.yesterday?.foodLogged).toBe(false);
    expect(w.yesterday?.kcal).toBe(0);
  });

  it('marks partial, over, workout and headroom per day', () => {
    const days = [
      day('2026-11-16', { kcal: 600, complete: false }),
      day('2026-11-17', { kcal: 2900 }),
      day(yesterday, { budget: 2470, target: 2100, workout: true, approx: true }),
    ];
    const w = weekCells({ days, todayDay: null, setupDay: '2026-11-16', yesterday, today });
    const [partial, over] = w.before;
    expect(partial.partial).toBe(true);
    expect(partial.over).toBe(false);
    expect(over.over).toBe(true);
    expect(over.partial).toBe(false);
    expect(w.yesterday?.headroom).toBe(370);
    expect(w.yesterday?.workout).toBe(true);
    expect(w.yesterday?.approx).toBe(true);
    expect(w.anyWorkout).toBe(true);
  });

  it('reads a drawn day missing from the list as nothing logged, and a day without food never as over', () => {
    const w = weekCells({ days: [day(yesterday)], todayDay: null, setupDay: null, yesterday, today });
    expect(w.before).toHaveLength(6);
    expect(w.before.every((c) => !c.foodLogged && !c.over && c.kcal === 0)).toBe(true);
  });

  it('counts a workout logged today in the legend', () => {
    const w = weekCells({ days: week, todayDay: day(today, { kcal: 0, foodLogged: false, complete: false, workout: true }), setupDay: null, yesterday, today });
    expect(w.anyWorkout).toBe(true);
  });

  it('starts every cell unkept', () => {
    const w = weekCells({ days: week, todayDay: null, setupDay: null, yesterday, today });
    expect([...w.before, w.yesterday!, w.today].every((c) => c.kept === false)).toBe(true);
  });
});

describe('withKept', () => {
  /** The days with food, as the phone's entries give them to `keptDays`. */
  const loggedOf = (days: WeekDayIn[]) => new Set(days.filter((d) => d.foodLogged).map((d) => d.date));
  const quiet = (d: WeekDayIn) => ({ ...d, kcal: 0, foodLogged: false, complete: false });

  it('marks a quiet day between logged days as kept, as the week strip draws it', () => {
    const days = week.map((d) => (d.date === '2026-11-15' ? quiet(d) : d));
    const w = withKept(weekCells({ days, todayDay: null, setupDay: null, yesterday, today }), keptDays(loggedOf(days), today));
    expect(w.before.filter((c) => c.kept).map((c) => c.date)).toEqual(['2026-11-15']);
    expect(w.yesterday?.kept).toBe(false);
    expect(w.anyKept).toBe(true);
  });

  it('marks yesterday kept while today is still open in a run of two logged days or more', () => {
    const days = week.map((d) => (d.date === yesterday ? quiet(d) : d));
    const w = withKept(weekCells({ days, todayDay: null, setupDay: null, yesterday, today }), keptDays(loggedOf(days), today));
    expect(w.yesterday?.kept).toBe(true);
    expect(w.before.some((c) => c.kept)).toBe(false);
    expect(w.anyKept).toBe(true);
  });

  it('never marks two quiet days in a row, which end the streak', () => {
    const days = week.map((d) => (d.date === '2026-11-14' || d.date === '2026-11-15' ? quiet(d) : d));
    const w = withKept(weekCells({ days, todayDay: null, setupDay: null, yesterday, today }), keptDays(loggedOf(days), today));
    expect([...w.before, w.yesterday!].some((c) => c.kept)).toBe(false);
    expect(w.anyKept).toBe(false);
  });

  it('marks only a drawn day before today with no food', () => {
    const w0 = weekCells({ days: week, todayDay: null, setupDay: null, yesterday, today });
    // A set that names a logged day and today (never the rule's answer) changes nothing.
    const w = withKept(w0, new Set(['2026-11-15', today]));
    expect([...w.before, w.yesterday!, w.today].some((c) => c.kept)).toBe(false);
    expect(w.anyKept).toBe(false);
  });

  it('names no kept day while the picture is left out', () => {
    const none = week.map(quiet);
    const w0 = weekCells({ days: none, todayDay: null, setupDay: null, yesterday, today });
    const w = withKept(w0, new Set(['2026-11-15']));
    expect(w.show).toBe(false);
    expect(w.anyKept).toBe(false);
  });
});
