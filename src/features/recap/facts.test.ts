import { describe, expect, it } from 'vitest';

import { activityFacts, topFoods, waterFacts, type FactDay } from './facts';

type E = Parameters<typeof topFoods>[0][number];
const entry = (date: string, name: string, o: Partial<E> = {}): E => ({ date, name, source: 'builtin', loggedAt: `${date}T08:00:00`, ...o });

describe('topFoods', () => {
  it('ranks foods by the days they were logged on, one food however often in a day', () => {
    const entries = [
      entry('2026-10-01', 'Oats', { foodId: 'oats' }),
      entry('2026-10-01', 'Oats', { foodId: 'oats' }),
      entry('2026-10-02', 'Oats', { foodId: 'oats' }),
      entry('2026-10-03', 'Oats', { foodId: 'oats' }),
      entry('2026-10-01', 'Banana'),
      entry('2026-10-02', 'banana'),
      entry('2026-10-02', 'Apple'),
    ];
    expect(topFoods(entries, '2026-10-01', '2026-10-31').map((f) => [f.name, f.days])).toEqual([
      ['Oats', 3],
      ['banana', 2],
    ]);
  });

  it('leaves out drinks from Water, quick adds, deleted entries and days outside the span', () => {
    const entries = [
      entry('2026-10-01', 'Milk', { via: 'water' }),
      entry('2026-10-02', 'Milk', { via: 'water' }),
      entry('2026-10-01', 'Quick add', { source: 'quick' }),
      entry('2026-10-02', 'Quick add', { source: 'quick' }),
      { ...entry('2026-10-01', 'Rice'), deleted: true },
      { ...entry('2026-10-02', 'Rice'), deleted: true },
      entry('2026-09-30', 'Tea'),
      entry('2026-11-01', 'Tea'),
    ];
    expect(topFoods(entries, '2026-10-01', '2026-10-31')).toEqual([]);
  });

  it('keeps at most three, ties by entries then by name', () => {
    const entries = ['A', 'B', 'C', 'D'].flatMap((n) => [entry('2026-10-01', n), entry('2026-10-02', n)]);
    entries.push(entry('2026-10-02', 'D'));
    expect(topFoods(entries, '2026-10-01', '2026-10-31').map((f) => f.name)).toEqual(['D', 'A', 'B']);
  });
});

const fact = (date: string, o: Partial<FactDay> = {}): FactDay => ({ date, waterMl: 0, waterGoalMl: 2000, waterEntries: [], activities: [], ...o });

describe('water and activity', () => {
  it('adds every drink to the total, and judges the goal on closed days with water logged as water', () => {
    const w = waterFacts(
      [
        fact('2026-10-01', { waterMl: 2100, waterEntries: [{}] }),
        fact('2026-10-02', { waterMl: 1500, waterEntries: [{}] }),
        // A diary drink alone counts in the total, never as a day tracked.
        fact('2026-10-03', { waterMl: 300, waterEntries: [{ fromEntryId: 'e1' }] }),
        // Today is still open.
        fact('2026-10-04', { waterMl: 2500, waterEntries: [{}] }),
      ],
      '2026-10-04',
    );
    expect(w).toEqual({ totalMl: 6400, daysTracked: 2, daysReached: 1 });
  });

  it('counts active minutes by the guideline rule, workouts and the days with one', () => {
    const a = activityFacts([
      fact('2026-10-01', { activities: [{ met: 4, durationMin: 30 }, { met: 8, durationMin: 20 }] }),
      fact('2026-10-02'),
      fact('2026-10-03', { activities: [{ met: 2, durationMin: 60 }] }),
    ]);
    // 30 moderate + 2 x 20 vigorous; a light walk counts no minutes but is still a workout.
    expect(a).toEqual({ activeMinutes: 70, workouts: 3, days: 2 });
  });
});
