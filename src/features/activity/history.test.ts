import { describe, expect, it } from 'vitest';

import type { ActivityEntry } from '@/types';

import { historyDaySpoken, historyDayWord, historyWeekLabel, historyWeeks, historyWeekTitle } from './history';

// Tuesday, Nov 24 2026: its week starts on Monday, Nov 23.
const TODAY = '2026-11-24';

const session = (id: string, date: string, durationMin: number, loggedAt = `${date}T10:00:00.000Z`): ActivityEntry =>
  ({ id, date, durationMin, loggedAt, activityId: 'volleyball', name: 'Volleyball', emoji: '🏐', category: 'sport', intensity: 'moderate', met: 4, kcalGross: 300, kcalNet: 250, updatedAt: loggedAt }) as unknown as ActivityEntry;

describe("Train's history by week", () => {
  it('names this week and last week, and every other week by its Monday', () => {
    expect(historyWeekTitle('2026-11-23', TODAY)).toBe('This week');
    expect(historyWeekTitle('2026-11-16', TODAY)).toBe('Last week');
    expect(historyWeekTitle('2026-11-09', TODAY)).toBe('Week of Nov 9');
    // A week of another year says its year.
    expect(historyWeekTitle('2025-12-29', '2026-01-20')).toBe('Week of Dec 29, 2025');
    // On a Monday, last week is the seven days before it.
    expect(historyWeekTitle('2026-11-16', '2026-11-23')).toBe('Last week');
  });

  it("gives each row its day: today and yesterday by name, else the weekday its card's title dates", () => {
    expect(historyDayWord(TODAY, TODAY)).toBe('Today');
    expect(historyDayWord('2026-11-23', TODAY)).toBe('Yesterday');
    expect(historyDayWord('2026-11-22', TODAY)).toBe('Sun');
    expect(historyDayWord('2026-11-16', TODAY)).toBe('Mon');
    expect(historyDaySpoken('2026-11-22', TODAY)).toBe('Sunday');
    expect(historyDaySpoken(TODAY, TODAY)).toBe('today');
    expect(historyDaySpoken('2026-11-23', TODAY)).toBe('yesterday');
  });

  it('groups the workouts into weeks, newest first, with the week total and the newest row on top', () => {
    const list = [
      session('a', '2026-11-16', 55),
      session('b', '2026-11-24', 75, '2026-11-24T08:00:00.000Z'),
      session('c', '2026-11-22', 45),
      session('d', '2026-11-24', 30, '2026-11-24T18:00:00.000Z'),
      session('e', '2026-11-23', 75),
      session('f', '2026-11-02', 40),
    ];
    const weeks = historyWeeks(list, TODAY);
    expect(weeks.map((w) => [w.start, w.title, w.minutes, w.entries.map((e) => e.id).join('')])).toEqual([
      ['2026-11-23', 'This week', 180, 'dbe'],
      ['2026-11-16', 'Last week', 100, 'ca'],
      ['2026-11-02', 'Week of Nov 2', 40, 'f'],
    ]);
    // Every workout is in exactly one week, and a week with none is left out.
    expect(weeks.reduce((n, w) => n + w.entries.length, 0)).toBe(list.length);
    expect(historyWeekLabel(weeks[0])).toBe('This week, 3 sessions, 3 h');
    expect(historyWeekLabel(weeks[2])).toBe('Week of Nov 2, 1 session, 40 min');
    expect(historyWeeks([], TODAY)).toEqual([]);
  });
});
